/**
 * Amira Store — PHASE-14 infrastructure/governance contract verification.
 *
 * What it verifies (docs/phases/PHASE-14.md DoD + the 2026-09-30 owner directive):
 *   1. CI workflow contract (.github/workflows/ci.yml):
 *      - triggers limited to main (push + pull_request) — ISSUE-2026-09-30-069 fix;
 *      - explicit least-privilege `permissions: contents: read`;
 *      - every third-party action pinned to a full 40-hex commit SHA;
 *      - Bun version pinned (no floating "latest");
 *      - the authoritative `verify` job keeps locked install + typecheck + lint + build;
 *      - the deterministic regression suites are NOT mandatory in CI
 *        (they need a disposable database/app server — documented as the
 *        environment-dependent verification layer, run per phase gate).
 *   2. Secret hygiene: no `.env*` file tracked except `.env.example`;
 *      `.gitignore` ignores `.env*`, `.auth/`, `.vercel/` and re-includes
 *      `!.env.example`.
 *   3. Environment contract: `.env.example` declares the required variable NAMES
 *      (DATABASE_URL, AUTH_SESSION_SECRET, APP_URL, Blob auth surfaces) and no
 *      real-looking values (non-empty assignments with secret-like lengths).
 *   4. Migration chain: the committed `drizzle/*.sql` files and the drizzle
 *      journal agree in count and order.
 *   5. Script contract: every command CI runs exists in package.json.
 *   6. Documentation contract: DEPLOYMENT_RUNBOOK.md documents the deployment
 *      order + rollback procedure; docs/ops/BASELINE.md records the
 *      infrastructure baseline identities (no secret values).
 *
 * Deterministic and offline: NO database, NO network, NO app server — safe to
 * run anywhere, including CI. The environment-dependent battery (disposable
 * PostgreSQL + app server + Blob-credential suites) is documented separately
 * in EXECUTION_STATUS.md / docs/ops/DEPLOYMENT_RUNBOOK.md.
 *
 * Run: bun run verify:phase14
 */

import fs from 'node:fs';
import path from 'node:path';

let passes = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) {
    passes += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

console.log('===== verify-phase14: infrastructure/governance contracts =====\n');

/* ------------------------------------------------------------------ */
console.log('[1] CI workflow contract (.github/workflows/ci.yml)');
{
  const ci = read('.github/workflows/ci.yml');

  check('push trigger restricted to ' + "[main]", /push:\s*\n\s*branches:\s*\n?\s*\[?\s*main\s*\]?/.test(ci));
  check('pull_request trigger restricted to ' + "[main]", /pull_request:\s*\n\s*branches:\s*\n?\s*\[?\s*main\s*\]?/.test(ci));

  check('workflow declares permissions', /(^|\n)permissions:\s*\n\s*contents:\s*read\s*(\n|$)/.test(ci));
  check('no write-all permissions', !/permissions:\s*write-all/.test(ci));
  check('no id-token in workflow (no OIDC consumer exists)', !/id-token:\s*write/.test(ci));

  const uses = [...ci.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  check('workflow has third-party steps', uses.length >= 2);
  const allPinned = uses.every((u) => !u.includes('@') || /^[0-9a-f]{40}$/.test(u.split('@')[1] ?? ''));
  check(`every "uses:" is SHA-pinned (${uses.length} steps)`, allPinned, uses.join(', '));
  const checkoutOk = uses.some((u) => u.startsWith('actions/checkout@') && /^[0-9a-f]{40}$/.test(u.split('@')[1]));
  const bunOk = uses.some((u) => u.startsWith('oven-sh/setup-bun@') && /^[0-9a-f]{40}$/.test(u.split('@')[1]));
  check('actions/checkout pinned to 40-hex SHA', checkoutOk);
  check('oven-sh/setup-bun pinned to 40-hex SHA', bunOk);

  check('bun version pinned (not "latest")', /bun-version:\s*\d+\.\d+\.\d+/.test(ci) && !/bun-version:\s*latest/.test(ci));

  check('job id "verify" present (authoritative check name)', /(^|\n)\s{2}verify:\s*\n/.test(ci));
  check('locked dependency install', /bun install --frozen-lockfile/.test(ci));
  check('typecheck step', /bun run typecheck/.test(ci));
  check('lint step', /bun run lint/.test(ci));
  check('build step', /bun run build/.test(ci));
  check('regression suites documented as environment-dependent (not silent)', /environment-dependent/i.test(ci));
  check('no secrets referenced in workflow', !/secrets\./.test(ci));
}

/* ------------------------------------------------------------------ */
console.log('\n[2] Secret hygiene / ignore rules');
{
  const gi = read('.gitignore');
  check('.env* ignored', /^\.env\*\s*$/m.test(gi));
  check('.env.example re-included', /^!\.env\.example\s*$/m.test(gi));
  check('.auth/ ignored (credential vault)', /\.auth\/?/m.test(gi));
  check('.vercel/ ignored (local link metadata)', /\.vercel\/?/m.test(gi));

  const tracked = require('node:child_process').execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const trackedEnv = tracked.filter((f) => /^\.env/.test(f));
  check(
    'only .env.example tracked among .env* files',
    trackedEnv.length === 1 && trackedEnv[0] === '.env.example',
    trackedEnv.join(', ') || 'none tracked',
  );
  check('no credential vault file tracked', tracked.every((f) => !f.startsWith('.auth/')));
  check('no vercel link metadata tracked', tracked.every((f) => !f.startsWith('.vercel/')));
}

/* ------------------------------------------------------------------ */
console.log('\n[3] Environment contract (.env.example — names only)');
{
  const env = read('.env.example');
  for (const name of ['DATABASE_URL', 'AUTH_SESSION_SECRET', 'APP_URL', 'BLOB_READ_WRITE_TOKEN']) {
    check(`declares ${name}`, new RegExp(`^${name}=$`, 'm').test(env));
  }
  const assigned = [...env.matchAll(/^([A-Z0-9_]+)=(.+)$/gm)].filter((m) => m[2].trim().length > 0);
  check('no non-empty values committed in .env.example', assigned.length === 0, assigned.map((m) => m[1]).join(', '));
}

/* ------------------------------------------------------------------ */
console.log('\n[4] Migration chain (committed files ↔ journal)');
{
  const dir = path.join(process.cwd(), 'drizzle');
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  check('3 committed migrations', sql.length === 3, sql.join(', '));
  const journal = JSON.parse(read('drizzle/meta/_journal.json'));
  const journalTags = journal.entries.map((e: { tag: string }) => e.tag);
  check('journal entries == migration files (order included)', journalTags.length === sql.length && journalTags.every((t: string, i: number) => sql[i]?.startsWith(t)));
  check(
    'journal idx/when strictly ordered (drizzle v7 journal carries no per-entry hash — DB-row hash equality is proven by the migration rehearsal, docs/ops/DATABASE.md §7)',
    journal.entries.every((e: { idx: number; when: number }, i: number) => e.idx === i) &&
      journal.entries.every((e: { when: number }, i: number, a: { when: number }[]) => i === 0 || e.when > a[i - 1].when),
  );
}

/* ------------------------------------------------------------------ */
console.log('\n[5] Script contract (CI commands exist in package.json)');
{
  const pkg = JSON.parse(read('package.json'));
  for (const cmd of ['typecheck', 'lint', 'build']) {
    check(`package.json script "${cmd}" exists`, typeof pkg.scripts?.[cmd] === 'string');
  }
  check('verify:phase14 registered', pkg.scripts?.['verify:phase14'] === 'bun scripts/verify-phase14.ts');
}

/* ------------------------------------------------------------------ */
console.log('\n[6] Documentation contract (deployment order + rollback + baseline)');
{
  const runbook = read('docs/ops/DEPLOYMENT_RUNBOOK.md');
  check('runbook documents rollback/recovery', /rollback/i.test(runbook));
  check('runbook documents deployment order', /production workflow/i.test(runbook));
  check('runbook documents the branch-protection platform limitation', /branch protection/i.test(runbook));
  const baseline = read('docs/ops/BASELINE.md');
  check('BASELINE.md records GitHub identity', /github/i.test(baseline));
  check('BASELINE.md records Vercel project identity', /vercel/i.test(baseline) && /prj_/.test(baseline));
  check('BASELINE.md records Neon topology (endpoints only)', /neon/i.test(baseline) && /ep-/.test(baseline));
  check('BASELINE.md carries no secret-looking values', !/vercel_[A-Za-z0-9_]{20,}/.test(baseline) && !/postgres(ql)?:\/\/[^\s]*:[^\s]*@/.test(baseline.replace(/<[^>]+>/g, '')));
}

/* ------------------------------------------------------------------ */
console.log(`\n===== verify-phase14: ${passes} passed, ${failures.length} failed =====`);
if (failures.length > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('[verify:phase14] ALL CHECKS PASS');
