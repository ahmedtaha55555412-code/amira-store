/**
 * Amira Store — login throttling (PHASE-03 task 6).
 *
 * DB-backed (serverless-safe — in-memory counters do not survive across
 * isolated function instances): failed login attempts ARE audit records, so
 * the throttle state is derived from `admin_activity_logs` rows with
 * actions `auth.login.failed` and transient `auth.login.attempt` reservations.
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

import { and, eq, gte, inArray, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { adminActivityLogs } from '@/db/schema';

export const LOGIN_FAILURE_WINDOW_MINUTES = 15;
export const LOGIN_MAX_FAILURES = 5;

const WINDOW_MS = LOGIN_FAILURE_WINDOW_MINUTES * 60_000;

export type LoginThrottleState = {
  throttled: boolean;
  recentFailures: number;
  /** Seconds until the oldest counted reservation/failure leaves the window (1 when throttled now). */
  retryAfterSeconds: number;
};

/**
 * Atomically admit one login attempt before bcrypt work. A short-lived
 * `auth.login.attempt` reservation counts against the same 15-minute budget as
 * failures, closing the concurrent check-then-record window. Username and IP
 * identities are locked independently so either spray dimension is serialized.
 */
export async function beginLoginAttempt(
  username: string,
  ipHash?: string | null,
): Promise<{ id: string } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`amira:login:username:${username}`}, 0))`,
    );
    if (ipHash) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`amira:login:ip:${ipHash}`}, 0))`,
      );
    }

    const since = new Date(Date.now() - WINDOW_MS);
    const identityCondition = ipHash
      ? sql`((${adminActivityLogs.metadata} ->> 'usernameAttempted') = ${username}
          or (${adminActivityLogs.metadata} ->> 'ipHash') = ${ipHash})`
      : sql`(${adminActivityLogs.metadata} ->> 'usernameAttempted') = ${username}`;
    const rows = await tx
      .select({
        n: sql<number>`count(*)::int`,
        oldest: sql<Date | null>`min(${adminActivityLogs.createdAt})`,
      })
      .from(adminActivityLogs)
      .where(
        and(
          inArray(adminActivityLogs.action, ['auth.login.failed', 'auth.login.attempt']),
          gte(adminActivityLogs.createdAt, since),
          identityCondition,
        ),
      );

    if ((rows[0]?.n ?? 0) >= LOGIN_MAX_FAILURES) return null;

    const [reservation] = await tx
      .insert(adminActivityLogs)
      .values({
        adminUserId: null,
        action: 'auth.login.attempt',
        entityType: 'admin_auth',
        entityId: null,
        metadata: { usernameAttempted: username, ipHash: ipHash ?? null },
      })
      .returning({ id: adminActivityLogs.id });

    return reservation ? { id: reservation.id } : null;
  });
}

/** Convert a transient reservation into the permanent failed-login audit row. */
export async function finalizeLoginFailure(input: {
  attemptId: string;
  usernameAttempted: string;
  ipHash?: string | null;
  adminUserId?: string | null;
  reason?: 'invalid_credentials' | 'inactive_account';
}): Promise<void> {
  const [updated] = await db
    .update(adminActivityLogs)
    .set({
      adminUserId: input.adminUserId ?? null,
      action: 'auth.login.failed',
      entityType: 'admin_auth',
      entityId: input.adminUserId ?? null,
      metadata: {
        usernameAttempted: input.usernameAttempted,
        ipHash: input.ipHash ?? null,
        reason: input.reason ?? 'invalid_credentials',
      },
    })
    .where(and(eq(adminActivityLogs.id, input.attemptId), eq(adminActivityLogs.action, 'auth.login.attempt')))
    .returning({ id: adminActivityLogs.id });

  if (!updated) {
    await recordLoginFailure(input);
  }
}

/** Drop a reservation when authentication aborted without a credential failure. */
export async function releaseLoginAttempt(attemptId: string): Promise<void> {
  await db
    .delete(adminActivityLogs)
    .where(and(eq(adminActivityLogs.id, attemptId), eq(adminActivityLogs.action, 'auth.login.attempt')));
}

/** Clear the reservation + transient username failures after successful login. */
export async function completeLoginAttemptSuccess(
  attemptId: string,
  username: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(adminActivityLogs)
      .where(and(eq(adminActivityLogs.id, attemptId), eq(adminActivityLogs.action, 'auth.login.attempt')));
    await tx
      .delete(adminActivityLogs)
      .where(
        and(
          eq(adminActivityLogs.action, 'auth.login.failed'),
          sql`(${adminActivityLogs.metadata} ->> 'usernameAttempted') = ${username}`,
        ),
      );
  });
}

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
        inArray(adminActivityLogs.action, ['auth.login.failed', 'auth.login.attempt']),
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

/* -------------------------------------------------------------------------- */
/* Change-password throttling (PHASE-12)                                        */
/* -------------------------------------------------------------------------- */

/**
 * The change-password endpoint re-verifies the CURRENT password inside a
 * valid session — an attacker with a hijacked tab could otherwise brute-force
 * it at unlimited rate. The same DB-backed pattern as the login throttle
 * applies: failed attempts ARE audit rows (`auth.password_change.failed`),
 * keyed by admin user id AND HMAC-hashed IP. Successful changes clear the
 * transient failure rows (the success row remains as the permanent marker).
 */

export const PASSWORD_CHANGE_FAILURE_WINDOW_MINUTES = LOGIN_FAILURE_WINDOW_MINUTES;
export const PASSWORD_CHANGE_MAX_FAILURES = LOGIN_MAX_FAILURES;

export type PasswordChangeThrottleState = {
  throttled: boolean;
  recentFailures: number;
  retryAfterSeconds: number;
};

export async function getPasswordChangeThrottleState(
  adminUserId: string,
  ipHash?: string | null,
): Promise<PasswordChangeThrottleState> {
  const since = new Date(Date.now() - WINDOW_MS);

  const identityCondition = ipHash
    ? sql`((${adminActivityLogs.adminUserId} = ${adminUserId})
          or (${adminActivityLogs.metadata} ->> 'ipHash') = ${ipHash})`
    : sql`(${adminActivityLogs.adminUserId} = ${adminUserId})`;

  const rows = await db
    .select({
      n: sql<number>`count(*)::int`,
      oldest: sql<Date | null>`min(${adminActivityLogs.createdAt})`,
    })
    .from(adminActivityLogs)
    .where(
      and(
        eq(adminActivityLogs.action, 'auth.password_change.failed'),
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
    throttled: recentFailures >= PASSWORD_CHANGE_MAX_FAILURES,
    recentFailures,
    retryAfterSeconds,
  };
}

/** Record one failed change-password attempt (audit row doubles as throttle state). */
export async function recordPasswordChangeFailure(input: {
  adminUserId: string;
  ipHash?: string | null;
  reason?: 'wrong_current_password' | 'validation_failed';
}): Promise<void> {
  await db.insert(adminActivityLogs).values({
    adminUserId: input.adminUserId,
    action: 'auth.password_change.failed',
    entityType: 'admin_auth',
    entityId: input.adminUserId,
    metadata: {
      ipHash: input.ipHash ?? null,
      reason: input.reason ?? 'wrong_current_password',
    },
  });
}

/** Remove transient failure rows for the admin after a successful change. */
export async function clearPasswordChangeFailures(adminUserId: string): Promise<void> {
  await db
    .delete(adminActivityLogs)
    .where(
      and(
        eq(adminActivityLogs.action, 'auth.password_change.failed'),
        eq(adminActivityLogs.adminUserId, adminUserId),
      ),
    );
}
