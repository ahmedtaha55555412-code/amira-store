/**
 * Amira Store — admin change-password endpoint (PHASE-03 task 9).
 *
 * Contract:
 * - Requires a valid admin session (401 otherwise) — the CURRENT password is
 *   still verified again, so a hijacked tab cannot rotate credentials.
 * - New password must match its confirmation and satisfy the strength policy.
 * - Security policy (documented in PHASE-03 verification): a password change
 *   REVOKES ALL SESSIONS (including the current device) and the caller is
 *   sent back to the login page. This bounds the lifetime of any stolen
 *   session the moment the owner rotates a credential.
 * - Activity recorded without any password material; audit row is written
 *   inside the same transaction as the credential update + revocation.
 * - CSRF: strict same-origin validation (Origin/Referer vs. deployment
 *   origin, OWASP "Verifying Origin With Standard Headers") +
 *   application/json content-type enforcement, before any credential work;
 *   SameSite=Lax cookie stays as defense-in-depth. Responses carry
 *   Cache-Control: no-store.
 */

import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { db } from '@/db/client';
import { adminActivityLogs, adminSessions, adminUsers } from '@/db/schema';
import { AdminAuthError, getClientIpHash, requireAdminMutation } from '@/lib/auth/guard';
import { isJsonRequest, isSameOriginRequest, withNoStore } from '@/lib/auth/origin';
import { hashPassword, passwordPolicyIssues, verifyPassword } from '@/lib/auth/password';
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/session';
import {
  clearPasswordChangeFailures,
  getPasswordChangeThrottleState,
  recordPasswordChangeFailure,
} from '@/lib/auth/throttle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
  confirmNewPassword: z.string().min(1).max(200),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  // CSRF/same-origin gate (ISSUE-2026-09-27-022) — before auth/body parsing.
  if (!isSameOriginRequest(request) || !isJsonRequest(request)) {
    return withNoStore(
      NextResponse.json({ error: 'طلب غير صالح.' }, { status: 403 }),
    );
  }

  let session;
  try {
    session = await requireAdminMutation();
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return withNoStore(NextResponse.json({ error: 'غير مصرح.' }, { status: 401 }));
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withNoStore(NextResponse.json({ error: 'طلب غير صالح.' }, { status: 400 }));
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return withNoStore(NextResponse.json({ error: 'طلب غير صالح.' }, { status: 400 }));
  }
  const { currentPassword, newPassword, confirmNewPassword } = parsed.data;

  // PHASE-12 throttle: brute-forcing the CURRENT password from a hijacked
  // session is bounded like login — DB-backed, keyed by admin + IP hash.
  const ipHash = await getClientIpHash();
  const throttle = await getPasswordChangeThrottleState(session.admin.id, ipHash);
  if (throttle.throttled) {
    return withNoStore(
      NextResponse.json(
        {
          error: `محاولات كثيرة فاشلة — أعد المحاولة بعد ${Math.ceil(throttle.retryAfterSeconds / 60)} دقيقة.`,
        },
        { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds) } },
      ),
    );
  }

  if (newPassword !== confirmNewPassword) {
    return withNoStore(
      NextResponse.json(
        { error: 'كلمتا المرور الجديدتان غير متطابقتين.' },
        { status: 422 },
      ),
    );
  }

  const policyIssues = passwordPolicyIssues(newPassword);
  if (policyIssues.length > 0) {
    return withNoStore(NextResponse.json({ error: policyIssues.join(' ') }, { status: 422 }));
  }

  try {
    const matched = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, session.admin.id))
      .limit(1);
    const user = matched[0];
    if (!user) {
      return withNoStore(NextResponse.json({ error: 'الحساب غير موجود.' }, { status: 401 }));
    }

    const currentOk = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentOk) {
      await recordPasswordChangeFailure({
        adminUserId: user.id,
        ipHash,
        reason: 'wrong_current_password',
      });
      return withNoStore(
        NextResponse.json(
          { error: 'كلمة المرور الحالية غير صحيحة.' },
          { status: 401 },
        ),
      );
    }

    const sameAsCurrent = await verifyPassword(newPassword, user.passwordHash);
    if (sameAsCurrent) {
      return withNoStore(
        NextResponse.json(
          { error: 'اختر كلمة مرور مختلفة عن كلمة المرور الحالية.' },
          { status: 422 },
        ),
      );
    }

    const newHash = await hashPassword(newPassword);

    await db.transaction(async (tx) => {
      await tx
        .update(adminUsers)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(adminUsers.id, user.id));

      // Policy: revoke ALL sessions (current device included).
      await tx.delete(adminSessions).where(eq(adminSessions.adminUserId, user.id));

      // Audit survives the session purge (activity rows are independent).
      await tx.insert(adminActivityLogs).values({
        adminUserId: user.id,
        action: 'auth.password_changed',
        entityType: 'admin_user',
        entityId: user.id,
        metadata: { sessionsRevoked: 'all' },
      });
    });

    // Transient throttle state is cleared on success (the success audit row
    // above remains as the permanent marker).
    await clearPasswordChangeFailures(user.id);

    const response = withNoStore(NextResponse.json({ ok: true, requireRelogin: true }));
    response.cookies.set(ADMIN_SESSION_COOKIE, '', {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error('[auth/change-password] handler failure', (error as Error)?.name);
    return withNoStore(
      NextResponse.json(
        { error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' },
        { status: 500 },
      ),
    );
  }
}
