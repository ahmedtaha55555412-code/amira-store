import type { Metadata } from 'next';

import { requireAdminPage } from '@/lib/auth/guard';
import { getStoreSettings } from '@/lib/admin/settings';

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

  const row = await getStoreSettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">إعدادات المتجر</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          هوية المتجر وبيانات التواصل — تنعكس على الواجهة فور الحفظ.
        </p>
      </div>

      {row ? (
        <SettingsForm
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
      ) : (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          إعدادات المتجر غير مهيأة — شغّل تهيئة قاعدة البيانات أولًا.
        </p>
      )}
    </div>
  );
}
