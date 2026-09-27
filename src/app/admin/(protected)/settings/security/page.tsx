import type { Metadata } from 'next';

import { ChangePasswordForm } from './change-password-form';

/**
 * Change-password page (PHASE-03 task 9) — inside the admin area only.
 * No forgot-password / email recovery exists anywhere by contract.
 */

export const metadata: Metadata = {
  title: 'تغيير كلمة المرور',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminSecurityPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-foreground">تغيير كلمة المرور</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          يتطلب التأكيد بكلمة المرور الحالية. بعد التغيير تُنهَى جميع الجلسات
          النشطة وسيُطلب منك تسجيل الدخول من جديد.
        </p>
      </section>

      <div className="rounded-2xl border bg-card p-6">
        <ChangePasswordForm />
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        نصيحة أمان: استخدم كلمة مرور فريدة بطول ١٢ حرفًا أو أكثر، ولا
        تعيد استخدامها في مواقع أخرى.
      </p>
    </div>
  );
}
