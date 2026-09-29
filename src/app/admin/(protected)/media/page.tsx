import type { Metadata } from 'next';

import { requireAdminPage } from '@/lib/auth/guard';
import { isMediaUploadConfigured } from '@/lib/media/service';
import {
  findUnreferencedMediaIds,
  listMediaAssets,
} from '@/lib/media/registry';

import { MediaManager } from './media-manager';

/**
 * Media library (PHASE-04 tasks 9–11 + PHASE-12 completion): registry of
 * storage-backed assets with upload (when the storage provider is
 * configured), alt-text editing, guarded deletion that reports referencing
 * domains, access-mode/type filters, copy-URL, unreferenced-asset
 * identification, and session-authenticated thumbnails for PRIVATE assets
 * (raw private-store provider URLs are not publicly fetchable — the admin
 * content route is the only honest preview path).
 */

export const metadata: Metadata = {
  title: 'الوسائط',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminMediaPage() {
  await requireAdminPage();
  const [assets, unreferencedIds, uploadConfigured] = await Promise.all([
    listMediaAssets(200),
    findUnreferencedMediaIds(200),
    Promise.resolve(isMediaUploadConfigured()),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-foreground">مكتبة الوسائط</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          الصور المخزنة في خدمة الوسائط (Vercel Blob). يُرفض حذف أي وسيط
          مستخدم في المنتجات أو التقييمات لحماية المراجع. أصول «خاصة» تُعرض
          هنا عبر مسار التسليم المُصادق فقط — ولا تُنشر روابطها الأصلية أبدًا.
        </p>
      </section>

      <MediaManager
        initialAssets={assets.map((asset) => ({
          id: asset.id,
          url: asset.url,
          pathname: asset.pathname,
          accessMode: asset.accessMode,
          mimeType: asset.mimeType,
          sizeBytes: Number(asset.sizeBytes),
          width: asset.width,
          height: asset.height,
          altText: asset.altText,
          unreferenced: unreferencedIds.includes(asset.id),
        }))}
        uploadConfigured={uploadConfigured}
      />
    </div>
  );
}
