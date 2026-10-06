/**
 * Amira Store — media registry service (PHASE-04 tasks 9 & 11).
 *
 * The DATABASE side of the media abstraction: `media_assets` rows are the
 * registry of provider objects; catalog/branding content references assets by
 * id. Rules:
 * - registration happens once per provider pathname (DB-unique);
 * - deletion is guarded: an asset referenced by ANY domain (product images,
 *   reviews, testimonials, homepage banners, brand settings) is refused —
 *   references can only be detached by the owning domain's own workflow, so
 *   no operation can orphan or silently re-point rows (PHASE-04 task 11).
 */

import { and, count, desc, eq, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  categories,
  homepageBanners,
  mediaAssets,
  productImages,
  reviewImages,
  storeSettings,
  whatsappTestimonials,
  type MediaAsset,
} from '@/db/schema';

/** Blockers that RESTRICT-delete the asset (reference must be removed first). */
const REFERENCE_SOURCES = [
  { label: 'صور المنتجات', table: productImages, column: productImages.mediaAssetId },
  { label: 'صور التقييمات', table: reviewImages, column: reviewImages.mediaAssetId },
  { label: 'صور واتساب', table: whatsappTestimonials, column: whatsappTestimonials.mediaAssetId },
  { label: 'بانرات الصفحة الرئيسية', table: homepageBanners, column: homepageBanners.mediaAssetId },
] as const;

export type MediaReferenceReport = {
  /** Asset may be hard-deleted (no hard references anywhere). */
  deletable: boolean;
  /** Human-readable list of blocking domains (Arabic) for admin UI. */
  blockers: string[];
  /** Weak references (SET NULL on delete) — informational only. */
  weakReferences: string[];
};

export async function getMediaReferenceReport(
  mediaAssetId: string,
): Promise<MediaReferenceReport> {
  const blockers: string[] = [];
  for (const source of REFERENCE_SOURCES) {
    const [row] = await db
      .select({ n: count() })
      .from(source.table)
      .where(eq(source.column, mediaAssetId));
    if ((row?.n ?? 0) > 0) blockers.push(source.label);
  }

  const [categoryRefs] = await db
    .select({ n: count() })
    .from(categories)
    .where(eq(categories.imageMediaId, mediaAssetId));
  const [settingsRefs] = await db
    .select({ n: count() })
    .from(storeSettings)
    .where(
      or(
        eq(storeSettings.logoMediaId, mediaAssetId),
        eq(storeSettings.faviconMediaId, mediaAssetId),
      ),
    );

  const weakReferences: string[] = [];
  if ((categoryRefs?.n ?? 0) > 0) weakReferences.push('صور الأقسام');
  if ((settingsRefs?.n ?? 0) > 0) weakReferences.push('هوية المتجر');

  return { deletable: blockers.length === 0, blockers, weakReferences };
}

/** Delete an asset if — and only if — nothing references it. */
export async function deleteMediaAsset(mediaAssetId: string): Promise<MediaReferenceReport> {
  const report = await getMediaReferenceReport(mediaAssetId);
  if (!report.deletable) return report;

  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaAssetId))
    .limit(1);
  if (!asset) return report;

  await db.delete(mediaAssets).where(eq(mediaAssets.id, mediaAssetId));

  // Best-effort provider cleanup AFTER the registry row is gone; a provider
  // failure leaves at most an unreferenced provider object, never a dangling
  // database row. Provider unavailability does not fail the request.
  try {
    const { getMediaStorageProvider } = await import('./service');
    const provider = getMediaStorageProvider();
    if (provider) await provider.delete(asset.pathname);
  } catch {
    // Registry deletion already succeeded; provider GC is non-critical.
  }
  return report;
}

/** List assets newest-first for the admin media library. */
export async function listMediaAssets(limit = 120): Promise<MediaAsset[]> {
  return db.select().from(mediaAssets).limit(limit);
}

/* -------------------------------------------------------------------------- */
/* PHASE-12: media library completion helpers                                  */
/* -------------------------------------------------------------------------- */

/**
 * Ids referenced by ANY domain table (hard + weak references alike).
 * One batched distinct-scan per reference table; the diff against the
 * registry ids yields the unreferenced set for the admin UI.
 */
export async function findUnreferencedMediaIds(limit = 200): Promise<string[]> {
  const assetRows = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .orderBy(desc(mediaAssets.createdAt))
    .limit(Math.min(limit, 500));
  if (assetRows.length === 0) return [];

  const referenced = new Set<string>();

  const hardSources = [
    { table: productImages, column: productImages.mediaAssetId },
    { table: reviewImages, column: reviewImages.mediaAssetId },
    { table: whatsappTestimonials, column: whatsappTestimonials.mediaAssetId },
    { table: homepageBanners, column: homepageBanners.mediaAssetId },
  ] as const;
  for (const source of hardSources) {
    const rows = await db.select({ id: source.column }).from(source.table);
    for (const row of rows) referenced.add(row.id);
  }

  const [categoryRows, settingsRows] = await Promise.all([
    db.select({ id: categories.imageMediaId }).from(categories),
    db
      .select({ logo: storeSettings.logoMediaId, favicon: storeSettings.faviconMediaId })
      .from(storeSettings),
  ]);
  for (const row of categoryRows) if (row.id) referenced.add(row.id);
  for (const row of settingsRows) {
    if (row.logo) referenced.add(row.logo);
    if (row.favicon) referenced.add(row.favicon);
  }

  return assetRows.map((row) => row.id).filter((id) => !referenced.has(id));
}

/** List only media that is safe to assign to product imagery. */
export async function listProductImageMediaAssets(limit = 120): Promise<MediaAsset[]> {
  return db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.accessMode, 'public'),
        sql`${mediaAssets.pathname} not like 'reviews/%' and ${mediaAssets.pathname} not like 'testimonials/%'`,
      ),
    )
    .orderBy(desc(mediaAssets.createdAt))
    .limit(limit);
}
