/**
 * Amira Store — login throttling (PHASE-03 task 6).
 *
 * DB-backed (serverless-safe — in-memory counters do not survive across
 * isolated function instances): failed login attempts ARE audit records, so
 * the throttle state is derived from `admin_activity_logs` rows with
 * action `auth.login.failed` (written by `recordLoginFailure` below).
 *
 * Identity of a failure: the submitted username AND the HMAC-hashed client
 * IP — so brute force against one account and one-source spraying are both
 * counted. No raw IPs, no passwords, ever.
 *
 * On successful login the transient failure rows for that username are
 * deleted (`clearLoginFailures`): they are security-state, while the
 * success row remains as the permanent audit marker. Documented in
 * DATA_DICTIONARY (PHASE-03 note).
 */

import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { adminActivityLogs } from '@/db/schema';

export const LOGIN_FAILURE_WINDOW_MINUTES = 15;
export const LOGIN_MAX_FAILURES = 5;

const WINDOW_MS = LOGIN_FAILURE_WINDOW_MINUTES * 60_000;

export type LoginThrottleState = {
  throttled: boolean;
  recentFailures: number;
  /** Seconds until the oldest counted failure leaves the window (1 when throttled now). */
  retryAfterSeconds: number;
};

export async function getLoginThrottleState(
  username: string,
  ipHash?: string | null,
): Promise<LoginThrottleState> {
  const since = new Date(Date.now() - WINDOW_MS);

  const identityCondition = ipHash
    ? // NOTE: the OR pair is fully parenthesized on purpose — drizzle's and()
      // inlines raw sql fragments verbatim, and an unparenthesized OR would
      // bind looser than the AND-ed action/window filters (found by QA).
      sql`((${adminActivityLogs.metadata} ->> 'usernameAttempted') = ${username}
          or (${adminActivityLogs.metadata} ->> 'ipHash') = ${ipHash})`
    : sql`(${adminActivityLogs.metadata} ->> 'usernameAttempted') = ${username}`;

  const rows = await db
    .select({
      n: sql<number>`count(*)::int`,
      oldest: sql<Date | null>`min(${adminActivityLogs.createdAt})`,
    })
    .from(adminActivityLogs)
    .where(
      and(
        eq(adminActivityLogs.action, 'auth.login.failed'),
        gte(adminActivityLogs.createdAt, since),
        identityCondition,
      ),
    );

  const recentFailures = rows[0]?.n ?? 0;
  const oldest = rows[0]?.oldest ? new Date(rows[0].oldest).getTime() : null;
  const retryAfterSeconds =
    oldest === null
      ? 0
      : Math.max(1, Math.ceil((oldest + WINDOW_MS - Date.now()) / 1000));

  return {
    throttled: recentFailures >= LOGIN_MAX_FAILURES,
    recentFailures,
    retryAfterSeconds,
  };
}

/**
 * Record one failed login (the audit row doubles as throttle state).
 * `adminUserId` is attached when the username exists but the credentials or
 * account state failed — unknown usernames log with a null admin.
 */
export async function recordLoginFailure(input: {
  usernameAttempted: string;
  ipHash?: string | null;
  adminUserId?: string | null;
  reason?: 'invalid_credentials' | 'inactive_account';
}): Promise<void> {
  await db.insert(adminActivityLogs).values({
    adminUserId: input.adminUserId ?? null,
    action: 'auth.login.failed',
    entityType: 'admin_auth',
    entityId: input.adminUserId ?? null,
    metadata: {
      usernameAttempted: input.usernameAttempted,
      ipHash: input.ipHash ?? null,
      reason: input.reason ?? 'invalid_credentials',
    },
  });
}

/** Remove transient failure rows for a username after a successful login. */
export async function clearLoginFailures(username: string): Promise<void> {
  await db
    .delete(adminActivityLogs)
    .where(
      and(
        eq(adminActivityLogs.action, 'auth.login.failed'),
        sql`(${adminActivityLogs.metadata} ->> 'usernameAttempted') = ${username}`,
      ),
    );
}
