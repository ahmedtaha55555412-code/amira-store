/**
 * Amira Store — storefront homepage content reader (PHASE-10).
 *
 * The PUBLIC side of the homepage content model: enabled sections in DB
 * order, active hero banners (inside their optional time window), and the
 * resolved branding contract. Business rules:
 *
 * - Query-driven sections stay query-driven: this module returns section
 *   META ONLY (title/subtitle/config/visibility/order). Product lists for
 *   «وصل حديثًا» / «العروض» keep coming from getStorefrontHomepageData()
 *   (created_at / variant-discount rules — untouched, no admin selection).
 * - Banners render from PUBLIC media only (D-4): private-store pathnames are
 *   never exposed here even if a bad reference existed.
 * - All reads are honest fallbacks: a missing row or empty config falls back
 *   to the code defaults — the homepage never breaks because content is not
 *   yet curated.
 */

import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { homepageBanners, homepageSections, mediaAssets } from '@/db/schema';
import {
  isHomeSectionKey,
  type HomeSectionKey,
} from '@/lib/admin/homepage';

export type HomepageSectionView = {
  id: string;
  key: HomeSectionKey;
  title: string | null;
  subtitle: string | null;
  config: Record<string, unknown> | null;
};

/**
 * Enabled sections in display order (sort_order, id as tie-break).
 * Unknown DB-only keys are skipped defensively (code-limited vocabulary).
 */
export async function getEnabledHomepageSections(): Promise<HomepageSectionView[]> {
  const rows = await db
    .select({
      id: homepageSections.id,
      sectionKey: homepageSections.sectionKey,
      title: homepageSections.title,
      subtitle: homepageSections.subtitle,
      config: homepageSections.config,
    })
    .from(homepageSections)
    .where(eq(homepageSections.isEnabled, true))
    .orderBy(asc(homepageSections.sortOrder), asc(homepageSections.id));

  return rows.flatMap((row) =>
    isHomeSectionKey(row.sectionKey)
      ? [
          {
            id: row.id,
            key: row.sectionKey,
            title: row.title,
            subtitle: row.subtitle,
            config: (row.config ?? null) as Record<string, unknown> | null,
          },
        ]
      : [],
  );
}

export type HomepageBannerView = {
  id: string;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imageUrl: string;
};

/**
 * Active hero banners inside their optional start/end window, display order.
 * Public media only (D-4): private-store pathnames map to nothing (skipped).
 */
export async function getActiveHomepageBanners(): Promise<HomepageBannerView[]> {
  const now = sql`now()`;
  const rows = await db
    .select({
      id: homepageBanners.id,
      title: homepageBanners.title,
      subtitle: homepageBanners.subtitle,
      ctaLabel: homepageBanners.ctaLabel,
      ctaHref: homepageBanners.ctaHref,
      mediaId: homepageBanners.mediaAssetId,
      mediaUrl: mediaAssets.url,
      mediaPathname: mediaAssets.pathname,
    })
    .from(homepageBanners)
    .innerJoin(mediaAssets, eq(homepageBanners.mediaAssetId, mediaAssets.id))
    .where(sql`${homepageBanners.isActive} = true
      and (${homepageBanners.startsAt} is null or ${homepageBanners.startsAt} <= ${now})
      and (${homepageBanners.endsAt} is null or ${homepageBanners.endsAt} >= ${now})`)
    .orderBy(asc(homepageBanners.sortOrder), asc(homepageBanners.id));

  // D-4: public CDN URLs only — private-store objects are skipped entirely.
  return rows.flatMap((row) =>
    row.mediaPathname.startsWith('reviews/') || row.mediaPathname.startsWith('testimonials/')
      ? []
      : [
          {
            id: row.id,
            title: row.title,
            subtitle: row.subtitle,
            ctaLabel: row.ctaLabel,
            ctaHref: row.ctaHref,
            imageUrl: row.mediaUrl,
          },
        ],
  );
}

/** Convenience gate used by tests: whether a key exists AND is enabled. */
export async function isHomepageSectionEnabled(key: HomeSectionKey): Promise<boolean> {
  const [row] = await db
    .select({ isEnabled: homepageSections.isEnabled })
    .from(homepageSections)
    .where(and(eq(homepageSections.sectionKey, key), eq(homepageSections.isEnabled, true)))
    .limit(1);
  return row !== undefined;
}
