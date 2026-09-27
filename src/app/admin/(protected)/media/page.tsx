import type { Metadata } from 'next';

import { requireAdminPage } from '@/lib/auth/guard';
import { isMediaUploadConfigured } from '@/lib/media/service';
import { listMediaAssets } from '@/lib/media/registry';

import { MediaManager } from './media-manager';

/**
 * Media library (PHASE-04 tasks 9–11): registry of storage-backed assets
 * with upload (when the storage provider is configured), alt-text editing,
 * and guarded deletion that reports referencing domains.
 */

export const metadata: Metadata = {
  title: 'الوسائط',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminMediaPage() {
  await requireAdminPage();
  const [assets, uploadConfigured] = await Promise.all([
    listMediaAssets(200),
    Promise.resolve(isMediaUploadConfigured()),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-foreground">مكتبة الوسائط</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          الصور المخزنة في خدمة الوسائط (Vercel Blob). يُرفض حذف أي وسيط
          مستخدم في المنتجات أو التقييمات لحماية المراجع.
        </p>
      </section>

      <MediaManager
        initialAssets={assets.map((asset) => ({
          id: asset.id,
          url: asset.url,
          pathname: asset.pathname,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
          altText: asset.altText,
        }))}
        uploadConfigured={uploadConfigured}
      />
    </div>
  );
}
