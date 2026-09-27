/**
 * Amira Store — admin login endpoint (PHASE-03 tasks 2, 3, 4, 6, 10, 11).
 *
 * Security contract:
 * - POST + JSON body {username, password}; anything else → generic rejection.
 * - Unknown username and wrong password produce the SAME generic error and
 *   the SAME response shape (no account enumeration; timing equalized via
 *   DUMMY_PASSWORD_HASH).
 * - Throttled after 5 failures / 15 min per submitted username or per hashed
 *   client IP (429 + Retry-After).
 * - Inactive admins are rejected with the same generic error.
 * - Success creates a DB session (token stored hashed only) and sets an
 *   HttpOnly / SameSite=Lax / Secure(https) cookie.
 * - Failures are audit-logged WITHOUT passwords; success logs never contain
 *   credential-shaped values (redaction filter in activity.ts).
 */

import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { db } from '@/db/client';
import { adminUsers } from '@/db/schema';
import { recordAdminActivity } from '@/lib/auth/activity';
import { getClientIpHash, isSecureRequest } from '@/lib/auth/guard';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '@/lib/auth/password';
import {
  ADMIN_SESSION_COOKIE,
  SESSION_TTL_MS,
  createAdminSession,
  purgeExpiredSessions,
  sessionCookieOptions,
} from '@/lib/auth/session';
import {
  clearLoginFailures,
  getLoginThrottleState,
  recordLoginFailure,
} from '@/lib/auth/throttle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

const GENERIC_INVALID = 'بيانات الدخول غير صحيحة.';
const GENERIC_ERROR = 'حدث خطأ غير متوقع. حاول مرة أخرى.';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC_INVALID }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_INVALID }, { status: 400 });
  }

  const username = parsed.data.username.trim();
  const password = parsed.data.password;

  try {
    const ipHash = await getClientIpHash();
    const userAgent = request.headers.get('user-agent')?.slice(0, 300) ?? null;

    // 1) Throttle before any credential work.
    const throttle = await getLoginThrottleState(username, ipHash);
    if (throttle.throttled) {
      return NextResponse.json(
        {
          error: `تم تجاوز عدد المحاولات المسموح. حاول بعد ${Math.ceil(throttle.retryAfterSeconds / 60)} دقيقة تقريبًا.`,
          retryAfterSeconds: throttle.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds) } },
      );
    }

    // 2) Single lookup; a missing admin still burns a bcrypt comparison.
    const matched = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, username))
      .limit(1);
    const user = matched[0];

    const passwordOk = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordOk) {
      await recordLoginFailure({ usernameAttempted: username, ipHash });
      return NextResponse.json({ error: GENERIC_INVALID }, { status: 401 });
    }

    if (!user.isActive) {
      await recordLoginFailure({
        usernameAttempted: username,
        ipHash,
        adminUserId: user.id,
        reason: 'inactive_account',
      });
      return NextResponse.json({ error: GENERIC_INVALID }, { status: 401 });
    }

    // 3) Success: clear transient failure state, create the session.
    await clearLoginFailures(username);
    try {
      await purgeExpiredSessions();
    } catch {
      // Opportunistic housekeeping must never block a login.
    }

    const session = await createAdminSession({
      adminUserId: user.id,
      userAgent,
      ipHash,
    });

    await db
      .update(adminUsers)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(adminUsers.id, user.id));

    await recordAdminActivity({
      adminUserId: user.id,
      action: 'auth.login.success',
      entityType: 'admin_user',
      entityId: user.id,
      metadata: { ipHash },
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      ADMIN_SESSION_COOKIE,
      session.token,
      sessionCookieOptions(isSecureRequest(request.headers), SESSION_TTL_MS / 1000),
    );
    return response;
  } catch (error) {
    // No tokens/passwords/usernames in server logs (PHASE-03 task 11).
    console.error('[auth/login] handler failure', typeof error, (error as Error)?.name);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}
