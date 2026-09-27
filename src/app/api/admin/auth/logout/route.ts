/**
 * Amira Store — admin logout endpoint (PHASE-03 task 5).
 *
 * POST (idempotent): destroys the session row for the presented cookie token
 * (if any), clears the cookie, and records the activity. Always responds ok —
 * logout never reveals whether a session existed.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { recordAdminActivity } from '@/lib/auth/activity';
import { isSecureRequest } from '@/lib/auth/guard';
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

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    '',
    sessionCookieOptions(isSecureRequest(request.headers), 0),
  );
  return response;
}
