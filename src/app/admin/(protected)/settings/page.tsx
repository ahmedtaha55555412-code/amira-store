import type { Metadata } from 'next';

import { requireAdminPage } from '@/lib/auth/guard';
import { getStoreSettings } from '@/lib/admin/settings';
import { getBrandSettings } from '@/lib/branding';

import { SettingsForm } from './settings-form';

export const metadata: Metadata = {
  title: 'إعدادات المتجر',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Admin store settings (PHASE-10): brand identity (name, logo, favicon),
 * WhatsApp communication (number + message template), support phone, social
 * links, and footer text. The singleton row is store DATA — no secrets live
 * here; checkout keeps reading the WhatsApp fields as the order-creation
 * truth (PHASE-07 contract unchanged).
 */
export default async function AdminSettingsPage() {
  await requireAdminPage();

  const [row, brand] = await Promise.all([getStoreSettings(), getBrandSettings()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">إعدادات المتجر</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          هوية المتجر وبيانات التواصل — تنعكس على الواجهة فور الحفظ.
        </p>
      </div>

      {row ? (
        <>
          <SettingsForm
            branding={{ logoUrl: brand.logoUrl, faviconUrl: brand.faviconUrl }}
            initial={{
              storeName: row.storeName,
              whatsappPhone: row.whatsappPhone,
              whatsappMessageTemplate: row.whatsappMessageTemplate,
              supportPhone: row.supportPhone,
              footerText: row.footerText,
              socialLinks: (row.socialLinks ?? null) as {
                instagram?: string;
                facebook?: string;
                tiktok?: string;
              } | null,
            }}
          />

          {/* Display-context settings (PHASE-12): the language/currency/
              timezone of the storefront are FIXED business scope (MASTER_PLAN
              §2/§32 — Arabic-only, EGP, Egypt). They live in store_settings as
              DATA and the display layer formats with exactly these values, so
              the surface is completed honestly as read-only business scope. */}
          <section
            aria-labelledby="display-context-h"
            className="rounded-2xl border bg-card p-4 sm:p-6"
          >
            <h2 id="display-context-h" className="text-lg font-bold">
              لغة العرض والعملة
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              ثابتة وفق نطاق عمل المتجر (عربي فقط · جنيه مصري · مصر) — لا تُعد
              من هذه الشاشة؛ تغييرها قرار مالك يُوثَّق في خطة المتجر. تُقرأ
              القيم من صف الإعدادات في قاعدة البيانات وتطابقها طبقة العرض.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-surface-subtle/40 p-3">
                <dt className="text-xs font-medium text-muted-foreground">اللغة</dt>
                <dd className="mt-1 text-sm font-bold text-foreground" dir="ltr">
                  {row.locale}
                </dd>
              </div>
              <div className="rounded-xl border bg-surface-subtle/40 p-3">
                <dt className="text-xs font-medium text-muted-foreground">العملة</dt>
                <dd className="mt-1 text-sm font-bold text-foreground" dir="ltr">
                  {row.currencyCode}
                </dd>
              </div>
              <div className="rounded-xl border bg-surface-subtle/40 p-3">
                <dt className="text-xs font-medium text-muted-foreground">المنطقة الزمنية</dt>
                <dd className="mt-1 text-sm font-bold text-foreground" dir="ltr">
                  {row.timezone}
                </dd>
              </div>
            </dl>
          </section>
        </>
      ) : (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          إعدادات المتجر غير مهيأة — شغّل تهيئة قاعدة البيانات أولًا.
        </p>
      )}
    </div>
  );
}
