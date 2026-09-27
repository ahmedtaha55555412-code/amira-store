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
 */

import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { db } from '@/db/client';
import { adminActivityLogs, adminSessions, adminUsers } from '@/db/schema';
import { AdminAuthError, requireAdminMutation } from '@/lib/auth/guard';
import { hashPassword, passwordPolicyIssues, verifyPassword } from '@/lib/auth/password';
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
  confirmNewPassword: z.string().min(1).max(200),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let session;
  try {
    session = await requireAdminMutation();
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: 'غير مصرح.' }, { status: 401 });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'طلب غير صالح.' }, { status: 400 });
  }
  const { currentPassword, newPassword, confirmNewPassword } = parsed.data;

  if (newPassword !== confirmNewPassword) {
    return NextResponse.json(
      { error: 'كلمتا المرور الجديدتان غير متطابقتين.' },
      { status: 422 },
    );
  }

  const policyIssues = passwordPolicyIssues(newPassword);
  if (policyIssues.length > 0) {
    return NextResponse.json({ error: policyIssues.join(' ') }, { status: 422 });
  }

  try {
    const matched = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, session.admin.id))
      .limit(1);
    const user = matched[0];
    if (!user) {
      return NextResponse.json({ error: 'الحساب غير موجود.' }, { status: 401 });
    }

    const currentOk = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentOk) {
      return NextResponse.json(
        { error: 'كلمة المرور الحالية غير صحيحة.' },
        { status: 401 },
      );
    }

    const sameAsCurrent = await verifyPassword(newPassword, user.passwordHash);
    if (sameAsCurrent) {
      return NextResponse.json(
        { error: 'اختر كلمة مرور مختلفة عن كلمة المرور الحالية.' },
        { status: 422 },
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

    const response = NextResponse.json({ ok: true, requireRelogin: true });
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
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' },
      { status: 500 },
    );
  }
}
