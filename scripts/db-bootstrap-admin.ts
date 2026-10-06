/**
 * Amira Store — FIRST-ADMIN bootstrap command (PHASE-03 task 8).
 *
 * The one sanctioned way to create the single admin identity. It is a CLI
 * command ONLY — deliberately not exposed as a web route (no /admin/register,
 * no /admin/create-admin — MASTER_PLAN §16 forbids them).
 *
 * Behavior:
 *  1. refuses to run when ANY admin already exists (creates the FIRST admin
 *     only; password changes happen inside the dashboard afterwards);
 *  2. credentials come from ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD
 *     environment variables, or an interactive prompt when a TTY is available;
 *  3. enforces the username + password policies;
 *  4. stores a bcrypt hash only — the plain password is never printed,
 *     logged, or persisted anywhere (not even in the audit log);
 *  5. records an `auth.bootstrap` activity entry (username + source only).
 *
 * Run (git-ignored .env.local supplies the variables locally):
 *   bun run db:bootstrap:admin
 */

import { isatty } from 'node:tty';
import { createInterface } from 'node:readline/promises';
import { sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import { adminUsers } from '../src/db/schema';
import { recordAdminActivity } from '../src/lib/auth/activity';
import {
  hashPassword,
  passwordPolicyIssues,
  usernameIssues,
} from '../src/lib/auth/password';

async function readCredential(prompt: string, hidden: boolean): Promise<string> {
  const rl = createInterface({ input: process.stdin });
  // For hidden input we accept visible typing in the CLI fallback; operators
  // should prefer the environment-variable path for anything sensitive.
  process.stdout.write(hidden ? `${prompt} (input will be echoed — prefer env vars): ` : prompt);
  const answer = await rl.question('');
  rl.close();
  return answer.trim();
}

const providedUsername = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim() ?? '';
const providedPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';

let username = providedUsername;
let password = providedPassword;

if (!username || !password) {
  if (!isatty(process.stdin.fd)) {
    console.error(
      '[admin-bootstrap] REFUSED: ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD are not set and no interactive terminal is available.',
    );
    process.exit(1);
  }
  console.log('[admin-bootstrap] interactive mode (env variables not fully set)');
  username ||= await readCredential('username: ', false);
  password ||= await readCredential('password: ', true);
}

const usernameProblems = usernameIssues(username);
if (usernameProblems.length > 0) {
  console.error('[admin-bootstrap] REFUSED: invalid username —', usernameProblems.join(' '));
  process.exit(1);
}

const passwordProblems = passwordPolicyIssues(password);
if (passwordProblems.length > 0) {
  console.error('[admin-bootstrap] REFUSED: weak password —', passwordProblems.join(' '));
  process.exit(1);
}

try {
  await db.execute(sql`SELECT 1`);
} catch (error) {
  console.error('[admin-bootstrap] REFUSED: cannot connect to the database.');
  console.error('[admin-bootstrap] Never commit connection strings or secrets.');
  throw error;
}
console.log('[admin-bootstrap] connectivity ✔');

const passwordHash = await hashPassword(password);

const created = await db.transaction(async (tx) => {
  // Serialize FIRST-admin creation across concurrent CLI processes. The lock is
  // transaction-scoped, so it is released automatically on commit/rollback.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('amira:first-admin-bootstrap', 0))`);

  const existing = await tx.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  if (existing.length > 0) {
    console.error(
      '[admin-bootstrap] REFUSED: an admin account already exists — this command creates the FIRST admin only. Change the password from inside the admin dashboard instead.',
    );
    return null;
  }

  const inserted = await tx
    .insert(adminUsers)
    .values({ username, passwordHash, isActive: true })
    .returning({ id: adminUsers.id, username: adminUsers.username });

  const row = inserted[0];
  if (!row) throw new Error('first-admin insert returned no row');

  await recordAdminActivity(
    {
      adminUserId: row.id,
      action: 'auth.bootstrap',
      entityType: 'admin_user',
      entityId: row.id,
      metadata: { source: 'cli-bootstrap', username: row.username },
    },
    tx,
  );

  return row;
});

if (!created) {
  await getPool().end();
  process.exit(1);
}

console.log(`[admin-bootstrap] admin created ✔ (username: ${created.username})`);
console.log('[admin-bootstrap] the password was NOT printed, logged, or stored in plain text.');
console.log('[admin-bootstrap] recommended: remove the ADMIN_BOOTSTRAP_* variables after this run.');

await getPool().end();
