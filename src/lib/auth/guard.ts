/**
 * Amira Store — admin authorization helpers (PHASE-03 task 7).
 *
 * EVERY admin page and EVERY admin mutation must go through one of:
 * - `requireAdminPage()`      → server components/layouts; redirects to login.
 * - `requireAdminMutation()`  → API routes; throws AdminAuthError (→ 401).
 * - `getAdminSession()`       → optional inspection (header rendering).
 *
 * The middleware (`src/middleware.ts`) performs only a cookie-presence
 * redirect for UX; authorization ALWAYS re-validates the session against the
 * database here — the cookie alone is never trusted.
 */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  ADMIN_SESSION_COOKIE,
  hashIp,
  resolveAdminSession,
  type AdminSessionContext,
} from '@/lib/auth/session';

/** Thrown by requireAdminMutation when there is no valid admin session. */
export class AdminAuthError extends Error {
  readonly status = 401;
  constructor() {
    super('admin authentication required');
    this.name = 'AdminAuthError';
  }
}

/** Read + validate the admin session from the request cookies. */
export async function getAdminSession(): Promise<AdminSessionContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return resolveAdminSession(token);
}

/** For protected server pages: redirect unauthenticated visitors to login. */
export async function requireAdminPage(): Promise<AdminSessionContext> {
  const session = await getAdminSession();
  if (!session) {
    redirect('/admin/login');
  }
  return session;
}

/** For admin API mutations: unauthenticated callers get a 401 JSON response. */
export async function requireAdminMutation(): Promise<AdminSessionContext> {
  const session = await getAdminSession();
  if (!session) {
    throw new AdminAuthError();
  }
  return session;
}

/** HMAC-hashed client IP for audit rows (null when the IP is unknowable). */
export async function getClientIpHash(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ip =
    forwarded?.split(',')[0]?.trim() || headerList.get('x-real-ip')?.trim() || null;
  return hashIp(ip);
}

/**
 * Whether the session cookie should carry the Secure flag.
 * Deployments terminate TLS at a proxy (x-forwarded-proto); local http
 * development keeps Secure off so the browser accepts the cookie.
 */
export function isSecureRequest(headerList: Headers): boolean {
  const proto = headerList.get('x-forwarded-proto');
  if (proto) {
    return proto.split(',')[0]?.trim() === 'https';
  }
  return (process.env.APP_URL ?? '').trim().startsWith('https://');
}
