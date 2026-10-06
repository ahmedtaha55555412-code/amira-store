/**
 * Amira Store — PHASE-03 auth verification suite.
 *
 * Exercises the application's OWN auth services (src/lib/auth/*) against the
 * target database and asserts every PHASE-03 verification item that can be
 * verified at the service layer:
 *
 *   1. password hashing roundtrip (wrong password rejected)
 *   2. password/username policy enforcement
 *   3. real-admin wrong-password rejection
 *   4. session create → resolve (hashed-token storage; raw token never stored)
 *   5. unknown token rejected
 *   6. expired session rejected
 *   7. logout destroys the session
 *   8. inactive admin rejected (login-equivalent session resolution)
 *   9. repeated failures trigger throttling; success clears it
 *  10. activity logs never contain credential-shaped keys
 *  11. single-admin invariant
 *  12. same-origin request validation (explicit CSRF control) + no-store
 *
 * Safety:
 * - REFUSES NODE_ENV=production (mutates transient state);
 * - state changes are restored in a finally block (isActive restored, probe
 *   rows deleted);
 * - never prints passwords, tokens, or connection strings.
 *
 * Run against the isolated development database only:
 *   set -a; . ./.env.local; set +a; bun run verify:auth
 */

import { createHash } from 'node:crypto';
import { and, eq, like, sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import { adminActivityLogs, adminSessions, adminUsers } from '../src/db/schema';
import { sanitizeMetadata } from '../src/lib/auth/activity';
import {
  isJsonRequest,
  isSameOriginRequest,
  normalizeOrigin,
  withNoStore,
} from '../src/lib/auth/origin';
import { hashPassword, passwordPolicyIssues, usernameIssues, verifyPassword } from '../src/lib/auth/password';
import {
  SESSION_TTL_MS,
  createAdminSession,
  destroyAdminSession,
  resolveAdminSession,
} from '../src/lib/auth/session';
import {
  LOGIN_FAILURE_WINDOW_MINUTES,
  LOGIN_MAX_FAILURES,
  beginLoginAttempt,
  clearLoginFailures,
  completeLoginAttemptSuccess,
  getLoginThrottleState,
  recordLoginFailure,
} from '../src/lib/auth/throttle';

if (process.env.NODE_ENV === 'production') {
  console.error('[verify-auth] REFUSED: never run auth probes against production.');
  process.exit(1);
}

let passes = 0;
let failures = 0;

function pass(name: string, detail = ''): void {
  passes += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail = ''): void {
  failures += 1;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(name: string, condition: boolean, detail = ''): void {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

const THROTTLE_PROBE_USERNAME = 'verify-auth-throttle-probe';
const createdTokenHashes: string[] = [];

try {
  // ------------------------------------------------------------------ env
  const rawUrl = process.env.DATABASE_URL ?? '';
  if (!rawUrl) {
    console.error('[verify-auth] REFUSED: DATABASE_URL is not set.');
    process.exit(1);
  }
  const host = new URL(rawUrl).hostname;
  console.log(`[verify-auth] target endpoint (non-secret): ${host}`);

  await db.execute(sql`SELECT 1`);

  const admins = await db.select().from(adminUsers);
  if (admins.length !== 1) {
    console.error(
      `[verify-auth] REFUSED: expected exactly 1 admin (found ${admins.length}). Run \`bun run db:bootstrap:admin\` first.`,
    );
    await getPool().end();
    process.exit(1);
  }
  const admin = admins[0];
  const adminId = admin.id;

  // ------------------------------------------------- 1) hashing roundtrip
  console.log('\n[1] password hashing');
  const samplePassword = 'Roundtrip-Sample-9271';
  const sampleHash = await hashPassword(samplePassword);
  assert('hash format is bcrypt', sampleHash.startsWith('$2b$') && sampleHash.length >= 60);
  assert('correct password verifies', await verifyPassword(samplePassword, sampleHash));
  assert('wrong password rejected', !(await verifyPassword('Roundtrip-Sample-9272', sampleHash)));

  // ------------------------------------------------------ 2) policy gates
  console.log('\n[2] policy enforcement');
  assert(
    'short password rejected by policy',
    passwordPolicyIssues('Sh0rt').length > 0,
  );
  assert(
    'no-digit password rejected by policy',
    passwordPolicyIssues('NoDigitsHereXxXx').length > 0,
  );
  assert(
    'policy accepts strong sample',
    passwordPolicyIssues('Roundtrip-Sample-9271'.replace('-', 'A')).length === 0,
  );
  assert('bad username rejected by policy', usernameIssues('a').length > 0);
  assert('good username accepted by policy', usernameIssues(admin.username).length === 0);

  // --------------------------------- 3) real-admin wrong-password rejection
  console.log('\n[3] real admin wrong-password rejection (login-equivalent check)');
  assert(
    'stored hash rejects a wrong password',
    !(await verifyPassword('definitely-not-the-password-123', admin.passwordHash)),
  );
  assert(
    'stored hash is not a plain-text password',
    admin.passwordHash !== admin.username && admin.passwordHash.startsWith('$2'),
  );

  // ------------------------------------------- 4) session create/resolve
  console.log('\n[4] session lifecycle — create & resolve');
  const sessionA = await createAdminSession({ adminUserId: adminId });
  createdTokenHashes.push(sqlHash(sessionA.token));
  const resolvedA = await resolveAdminSession(sessionA.token);
  assert('fresh session resolves', resolvedA !== null);
  assert('resolved admin identity matches', resolvedA?.admin.username === admin.username);
  assert(
    'resolved admin row exposes no passwordHash',
    resolvedA !== null && !('passwordHash' in resolvedA.admin),
  );
  assert(
    'stored value is the SHA-256 hash, not the raw token',
    await tokenStoredHashed(sessionA.token),
  );
  assert(
    'expiry set to ~7 days',
    Math.abs((sessionA.expiresAt.getTime() - Date.now()) - SESSION_TTL_MS) < 5_000,
  );

  // ------------------------------------------------- 5) unknown token
  console.log('\n[5] unknown token rejection');
  assert(
    'unknown token resolves to null',
    (await resolveAdminSession('totally-unknown-token-value')) === null,
  );

  // ---------------------------------------------------- 6) expiry enforced
  console.log('\n[6] expired session rejection');
  const sessionB = await createAdminSession({ adminUserId: adminId });
  createdTokenHashes.push(sqlHash(sessionB.token));
  await db
    .update(adminSessions)
    .set({ expiresAt: new Date(Date.now() - 1_000) })
    .where(eq(adminSessions.sessionTokenHash, sqlHash(sessionB.token)));
  assert(
    'expired session resolves to null',
    (await resolveAdminSession(sessionB.token)) === null,
  );

  // ---------------------------------------------------- 7) logout destroys
  console.log('\n[7] logout (session destruction)');
  const destroyed = await destroyAdminSession(sessionA.token);
  assert('destroy reports success', destroyed);
  assert('destroyed session no longer resolves', (await resolveAdminSession(sessionA.token)) === null);
  assert(
    'second destroy is a no-op (idempotent)',
    !(await destroyAdminSession(sessionA.token)),
  );

  // --------------------------------------------- 8) inactive admin rejected
  console.log('\n[8] inactive admin rejection');
  const sessionC = await createAdminSession({ adminUserId: adminId });
  createdTokenHashes.push(sqlHash(sessionC.token));
  try {
    await db.update(adminUsers).set({ isActive: false }).where(eq(adminUsers.id, adminId));
    assert(
      'session of deactivated admin resolves to null',
      (await resolveAdminSession(sessionC.token)) === null,
    );
  } finally {
    await db.update(adminUsers).set({ isActive: true }).where(eq(adminUsers.id, adminId));
  }
  assert(
    're-activated admin resolves again (state restored)',
    (await resolveAdminSession(sessionC.token)) !== null,
  );

  // ------------------------------------------------------- 9) throttling
  console.log('\n[9] login throttling');
  const initialThrottle = await getLoginThrottleState(THROTTLE_PROBE_USERNAME);
  assert('initial state not throttled', !initialThrottle.throttled);
  const reservation = await beginLoginAttempt(THROTTLE_PROBE_USERNAME);
  assert('login admission reserves one throttle slot atomically', reservation !== null);
  const reservedThrottle = await getLoginThrottleState(THROTTLE_PROBE_USERNAME);
  assert(
    'active reservation is visible to throttle state',
    reservedThrottle.recentFailures === 1 && !reservedThrottle.throttled,
  );
  if (reservation) await completeLoginAttemptSuccess(reservation.id, THROTTLE_PROBE_USERNAME);
  const postReservationThrottle = await getLoginThrottleState(THROTTLE_PROBE_USERNAME);
  assert(
    'successful reservation release restores clear state',
    postReservationThrottle.recentFailures === 0 && !postReservationThrottle.throttled,
  );
  for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) {
    await recordLoginFailure({ usernameAttempted: THROTTLE_PROBE_USERNAME });
  }
  const throttledState = await getLoginThrottleState(THROTTLE_PROBE_USERNAME);
  assert(
    `${LOGIN_MAX_FAILURES} failures trigger throttling`,
    throttledState.throttled,
    `window=${LOGIN_FAILURE_WINDOW_MINUTES}min`,
  );
  assert('retry-after is positive', throttledState.retryAfterSeconds >= 1);
  await clearLoginFailures(THROTTLE_PROBE_USERNAME);
  const clearedState = await getLoginThrottleState(THROTTLE_PROBE_USERNAME);
  assert('successful-login cleanup clears throttle state', !clearedState.throttled);

  // -------------------------------------- 10) activity log hygiene scan
  console.log('\n[10] activity-log secret hygiene');
  const authLogs = await db
    .select({ metadata: adminActivityLogs.metadata })
    .from(adminActivityLogs)
    .where(like(adminActivityLogs.action, 'auth.%'));
  const serialized = authLogs.map((row) => JSON.stringify(row.metadata ?? {}));
  assert(
    'no credential-shaped keys in any auth log',
    serialized.every((text) => !/"[^"]*(password|pwd|token|secret|cookie|credential)[^"]*"\s*:/.test(text.toLowerCase())),
    `${authLogs.length} rows scanned`,
  );
  const redactionWorks = JSON.stringify(
    sanitizeMetadata({ password: 'x', nested: { sessionToken: 'y', ok: 1 } }),
  );
  assert(
    'metadata sanitizer redacts nested credential keys',
    redactionWorks.includes('[redacted]') && redactionWorks.includes('"ok":1'),
  );

  // ------------------------------------------------ 11) single admin rule
  console.log('\n[11] single-admin invariant');
  const [{ n: adminCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminUsers);
  assert('exactly one admin exists', adminCount === 1, `count=${adminCount}`);

  // ---------------------------------------- 12) same-origin validation
  // Explicit CSRF control on the state-changing admin endpoints (OWASP
  // "Verifying Origin With Standard Headers"). Pure Request-level logic —
  // no database involved. NOTE: `host` is a forbidden header for new
  // Request(), so the derived-host cases use x-forwarded-host/proto.
  console.log('\n[12] same-origin request validation (CSRF control)');
  const originBase = 'https://store.example';
  const sameOriginRequest = () =>
    new Request(`${originBase}/api/admin/auth/login`, {
      method: 'POST',
      headers: {
        'x-forwarded-host': 'store.example',
        'x-forwarded-proto': 'https',
        'content-type': 'application/json',
      },
    });

  const originOk = sameOriginRequest();
  originOk.headers.set('origin', originBase);
  assert('same-site Origin accepted', isSameOriginRequest(originOk));

  const originDefaultPort = sameOriginRequest();
  originDefaultPort.headers.set('origin', `${originBase}:443`);
  assert('default-port Origin normalised to a match', isSameOriginRequest(originDefaultPort));

  const originHostPort = sameOriginRequest();
  originHostPort.headers.set('x-forwarded-host', 'store.example:443');
  originHostPort.headers.set('origin', originBase);
  assert('forwarded default-port host normalised to a match', isSameOriginRequest(originHostPort));

  const originEvil = sameOriginRequest();
  originEvil.headers.set('origin', 'https://evil.attacker');
  assert('cross-site Origin rejected', !isSameOriginRequest(originEvil));

  const originLookalike = sameOriginRequest();
  originLookalike.headers.set('origin', `${originBase}.evil.attacker`);
  assert('suffix look-alike Origin rejected', !isSameOriginRequest(originLookalike));

  const originNullValue = sameOriginRequest();
  originNullValue.headers.set('origin', 'null');
  assert('literal null Origin rejected', !isSameOriginRequest(originNullValue));

  const refererOk = sameOriginRequest();
  refererOk.headers.set('referer', `${originBase}/admin/settings/security`);
  assert('same-origin Referer fallback accepted (no Origin)', isSameOriginRequest(refererOk));

  const refererEvil = sameOriginRequest();
  refererEvil.headers.set('referer', 'https://evil.attacker/login');
  assert('cross-site Referer rejected', !isSameOriginRequest(refererEvil));

  const bareRequest = sameOriginRequest();
  assert('no Origin AND no Referer rejected', !isSameOriginRequest(bareRequest));

  const appUrlOrigin = normalizeOrigin(process.env.APP_URL);
  if (appUrlOrigin) {
    const appUrlRequest = new Request('https://some-other-host.example/api/admin/auth/login', {
      method: 'POST',
    });
    appUrlRequest.headers.set('origin', appUrlOrigin);
    assert('APP_URL origin accepted (deployment allowlist)', isSameOriginRequest(appUrlRequest));
  } else {
    fail('APP_URL origin accepted (deployment allowlist)', 'APP_URL not set in this environment');
  }

  const jsonOk = sameOriginRequest();
  assert('application/json content type accepted', isJsonRequest(jsonOk));
  const jsonFormSpoof = sameOriginRequest();
  jsonFormSpoof.headers.set('content-type', 'text/plain');
  assert('text/plain content type rejected (form-spoofed JSON)', !isJsonRequest(jsonFormSpoof));
  const jsonMissing = sameOriginRequest();
  jsonMissing.headers.delete('content-type');
  assert('missing content type rejected', !isJsonRequest(jsonMissing));

  const noStoreProbe = new Response('{}', { status: 200 });
  withNoStore(noStoreProbe);
  assert('withNoStore sets Cache-Control: no-store', noStoreProbe.headers.get('cache-control') === 'no-store');
  assert(
    'normalizeOrigin rejects malformed input',
    normalizeOrigin('not a url') === null && normalizeOrigin('ftp://x') === null && normalizeOrigin(null) === null,
  );
} catch (error) {
  failures += 1;
  console.error('\n[verify-auth] UNEXPECTED FAILURE:', (error as Error)?.name, (error as Error)?.message);
} finally {
  // ------------------------------------------------------------- cleanup
  try {
    for (const tokenHash of createdTokenHashes) {
      await db.delete(adminSessions).where(eq(adminSessions.sessionTokenHash, tokenHash));
    }
    await db
      .delete(adminActivityLogs)
      .where(
        and(
          eq(adminActivityLogs.action, 'auth.login.failed'),
          sql`(${adminActivityLogs.metadata} ->> 'usernameAttempted') = ${THROTTLE_PROBE_USERNAME}`,
        ),
      );
  } catch (cleanupError) {
    failures += 1;
    console.error('[verify-auth] CLEANUP FAILURE:', (cleanupError as Error)?.message);
  }
}

console.log(`\n[verify-auth] ${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.error('[verify-auth] AUTH VERIFICATION FAILED');
  await getPool().end();
  process.exit(1);
}
console.log('[verify-auth] ALL AUTH CHECKS PASS');
await getPool().end();

/* ---------------------------------------------------------------- helpers */

function sqlHash(token: string): string {
  // Mirrors session.hashSessionToken (kept local so the script asserts the
  // hashing contract without sharing mutable state with the app module).
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

async function tokenStoredHashed(token: string): Promise<boolean> {
  const hash = sqlHash(token);
  const byHash = await db
    .select({ id: adminSessions.id })
    .from(adminSessions)
    .where(eq(adminSessions.sessionTokenHash, hash))
    .limit(1);
  if (byHash.length !== 1) return false;
  // The raw token must NOT be persisted anywhere in the row.
  const byRaw = await db
    .select({ id: adminSessions.id })
    .from(adminSessions)
    .where(eq(adminSessions.sessionTokenHash, token))
    .limit(1);
  return byRaw.length === 0;
}
