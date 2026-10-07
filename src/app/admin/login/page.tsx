import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import { BrandLogo } from '@/components/brand/brand-logo';

import { LoginForm } from './login-form';

/**
 * Admin login page (PHASE-03).
 * The ONLY public admin route: no register / create-admin / forgot-password
 * flow exists by contract (MASTER_PLAN §16 — single admin, username+password).
 */

export const metadata: Metadata = {
  title: 'تسجيل دخول الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminLoginPage() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-background px-4 py-10"
    >
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <BrandLogo
            showArabicWordmark
            showEnglishWordmark
            markClassName="h-12 w-12"
            wordmarkClassName="text-2xl"
          />
          <p className="text-sm text-muted-foreground">{BRAND.tagline}</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-bold text-foreground">دخول لوحة التحكم</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            أدخل بيانات حساب الإدارة للمتابعة.
          </p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          منطقة مخصصة لإدارة المتجر فقط. لا يوجد تسجيل حساب جديد ولا استعادة
          كلمة مرور — لإعادة التعيين تواصل مع مدير المتجر مباشرة.
        </p>
      </div>
    </main>
  );
}
