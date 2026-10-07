/**
 * Amira Store — admin session lifecycle (PHASE-03).
 *
 * Model (schema: admin_users / admin_sessions — PHASE-02):
 * - The session token is 256 bits of CSPRNG output (base64url). It exists in
 *   exactly two places: the HttpOnly cookie and — as a SHA-256 digest — the
 *   `admin_sessions.session_token_hash` row. The raw token is never stored
 *   and never logged (PHASE-03 tasks 3 & 11).
 * - Fixed absolute expiry (7 days). `last_seen_at` is refreshed opportunistically
 *   (throttled to once per minute) for auditing, NOT for sliding renewal.
 * - `AUTH_SESSION_SECRET` is used only as the HMAC key for client IP hashing
 *   (audit pseudonymisation — schema doc for `admin_sessions.ip_hash`).
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';

import { db, type AmiraDatabase } from '@/db/client';
import { adminSessions, adminUsers, type AdminUser } from '@/db/schema';

export const ADMIN_SESSION_COOKIE = 'amira_admin_session';

/** Absolute session lifetime: 7 days (documented in TRACEABILITY/PHASE-03). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const LAST_SEEN_REFRESH_INTERVAL_MS = 60_000;

/** Public shape of the admin account — passwordHash must never be included. */
export type SafeAdmin = Omit<AdminUser, 'passwordHash'>;

export type AdminSessionContext = {
  admin: SafeAdmin;
  sessionId: string;
  expiresAt: Date;
};

function requireSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'AUTH_SESSION_SECRET is not configured. Set a strong per-environment random secret — see .env.example.',
    );
  }
  return secret;
}

/** SHA-256 of the raw session token — the only value persisted. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Salted (HMAC) client-IP digest for audit rows — never the raw IP. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac('sha256', requireSessionSecret())
    .update(ip, 'utf8')
    .digest('hex');
}

function toSafeAdmin(row: AdminUser): SafeAdmin {
  return {
    id: row.id,
    username: row.username,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type CreatedAdminSession = { token: string; expiresAt: Date };
type SessionWriter = Pick<AmiraDatabase, 'insert'>;

/** Create a session row and return the one-time raw token (goes to the cookie). */
export async function createAdminSession(input: {
  adminUserId: string;
  userAgent?: string | null;
  ipHash?: string | null;
}, writer: SessionWriter = db): Promise<CreatedAdminSession> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await writer.insert(adminSessions).values({
    adminUserId: input.adminUserId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
    ipHash: input.ipHash ?? null,
  });
  return { token, expiresAt };
}

/**
 * Resolve a raw cookie token into a valid session + active admin.
 * Returns null for unknown/expired tokens and for deactivated admins.
 */
export async function resolveAdminSession(
  token: string | null | undefined,
): Promise<AdminSessionContext | null> {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);

  const rows = await db
    .select({ session: adminSessions, user: adminUsers })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
    .where(
      and(
        eq(adminSessions.sessionTokenHash, tokenHash),
        gt(adminSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (!row.user.isActive) return null;

  // Opportunistic audit refresh — at most once per minute per session.
  const lastSeen = row.session.lastSeenAt?.getTime() ?? 0;
  if (Date.now() - lastSeen > LAST_SEEN_REFRESH_INTERVAL_MS) {
    await db
      .update(adminSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(adminSessions.id, row.session.id));
  }

  return {
    admin: toSafeAdmin(row.user),
    sessionId: row.session.id,
    expiresAt: row.session.expiresAt,
  };
}

/** Delete a single session by raw token (logout). True when a row was removed. */
export async function destroyAdminSession(
  token: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;
  const deleted = await db
    .delete(adminSessions)
    .where(eq(adminSessions.sessionTokenHash, hashSessionToken(token)))
    .returning({ id: adminSessions.id });
  return deleted.length > 0;
}

/** Delete expired session rows (called opportunistically on login). */
export async function purgeExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(adminSessions)
    .where(lt(adminSessions.expiresAt, new Date()))
    .returning({ id: adminSessions.id });
  return deleted.length;
}

/** Cookie attributes for the session cookie (PHASE-03 task 4). */
export function sessionCookieOptions(
  secure: boolean,
  maxAgeSeconds: number,
): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
