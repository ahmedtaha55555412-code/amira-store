/**
 * Amira Store — admin logout endpoint (PHASE-03 task 5).
 *
 * POST (idempotent): destroys the session row for the presented cookie token
 * (if any), clears the cookie, and records the activity. Always responds ok —
 * logout never reveals whether a session existed.
 *
 * CSRF: strict same-origin validation (Origin/Referer vs. deployment origin,
 * OWASP "Verifying Origin With Standard Headers") before any session work;
 * the SameSite=Lax cookie stays as defense-in-depth. Responses carry
 * Cache-Control: no-store.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { recordAdminActivity } from '@/lib/auth/activity';
import { isSecureRequest } from '@/lib/auth/guard';
import { isSameOriginRequest, withNoStore } from '@/lib/auth/origin';
import {
  ADMIN_SESSION_COOKIE,
  SESSION_TTL_MS,
  destroyAdminSession,
  resolveAdminSession,
  sessionCookieOptions,
} from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // CSRF/same-origin gate (ISSUE-2026-09-27-022) — before any session work.
  if (!isSameOriginRequest(request)) {
    return withNoStore(
      NextResponse.json({ error: 'طلب غير مصرح به.' }, { status: 403 }),
    );
  }

  try {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (token) {
      // Resolve first so the audit row can reference the admin; then destroy.
      const context = await resolveAdminSession(token);
      const destroyed = await destroyAdminSession(token);
      if (context) {
        await recordAdminActivity({
          adminUserId: context.admin.id,
          action: 'auth.logout',
          entityType: 'admin_user',
          entityId: context.admin.id,
          metadata: { sessionDestroyed: destroyed },
        });
      }
    }
  } catch (error) {
    console.error('[auth/logout] handler failure', (error as Error)?.name);
  }

  const response = withNoStore(NextResponse.json({ ok: true }));
  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    '',
    sessionCookieOptions(isSecureRequest(request.headers), 0),
  );
  return response;
}
