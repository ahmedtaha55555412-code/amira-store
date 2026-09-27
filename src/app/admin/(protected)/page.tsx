import { ArrowLeftCircle, Boxes, ClipboardList, Package, Settings, Star } from 'lucide-react';
import Link from 'next/link';
import { KeyRound, ShieldCheck } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAdminPage } from '@/lib/auth/guard';

/**
 * Admin dashboard placeholder (PHASE-03 scope boundary).
 * Proves the authenticated boundary and exposes the security entry point;
 * every functional module is an honest "قريبًا" placeholder until its own
 * phase (PHASE-04+) — never presented as working functionality.
 */

export const dynamic = 'force-dynamic';

const upcomingModules = [
  { title: 'المنتجات والأصناف', icon: Package, phase: 'المرحلة ٤' },
  { title: 'الطلبات', icon: ClipboardList, phase: 'المرحلة ٧–٨' },
  { title: 'المخزون', icon: Boxes, phase: 'المرحلة ٨' },
  { title: 'التقييمات وواتساب', icon: Star, phase: 'المرحلة ٩' },
  { title: 'إعدادات المتجر', icon: Settings, phase: 'المرحلة ١٢' },
] as const;

export default async function AdminDashboardPage() {
  const { admin } = await requireAdminPage();
  const lastLogin = admin.lastLoginAt
    ? new Intl.DateTimeFormat('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
        calendar: 'gregory',
        numberingSystem: 'latn',
      }).format(admin.lastLoginAt)
    : 'أول تسجيل دخول سيُسجَّل بعد الآن';

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-6">
        <h1 className="text-2xl font-bold text-foreground">
          أهلًا بك، {admin.username} 👋
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          هذه لوحة تحكم متجر أميرة استور. حاليًا تُظهر هذه الصفحة حدود الحماية
          وبيانات الحساب فقط — ستُضاف إدارات المتجر تباعًا وفق خطة التنفيذ.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              الحساب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p className="text-muted-foreground">
              اسم المستخدم:{' '}
              <span className="font-semibold text-foreground" dir="ltr">
                {admin.username}
              </span>
            </p>
            <p className="text-muted-foreground">
              الحالة:{' '}
              <span className="font-semibold text-success">نشط</span>
            </p>
            <p className="text-muted-foreground">
              آخر دخول:{' '}
              <span className="font-semibold text-foreground">{lastLogin}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
              أمان الحساب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              يمكنك تغيير كلمة المرور من داخل اللوحة (تتطلب كلمة المرور
              الحالية). تغيير كلمة المرور يُنهي جميع الجلسات النشطة.
            </p>
            <Link
              href="/admin/settings/security"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ArrowLeftCircle className="h-4 w-4" aria-hidden="true" />
              تغيير كلمة المرور
            </Link>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="upcoming-modules-heading" className="space-y-3">
        <h2 id="upcoming-modules-heading" className="text-lg font-bold text-foreground">
          إدارات المتجر
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {upcomingModules.map((module) => (
            <div
              key={module.title}
              aria-disabled="true"
              className="flex items-center justify-between rounded-xl border bg-card p-4 opacity-70"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blush text-secondary-foreground">
                  <module.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {module.title}
                  </p>
                  <p className="text-xs text-muted-foreground">قريبًا — {module.phase}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
