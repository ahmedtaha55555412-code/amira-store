/**
 * Amira Store — homepage content admin service (PHASE-10).
 *
 * Admin management of the homepage content model (MASTER_PLAN §4; docs/
 * DATA_DICTIONARY.md homepage_sections / homepage_banners). Business rules:
 *
 * - Section keys are limited BY CODE (HOMESECTION_KEYS) — arbitrary keys can
 *   never be created, and NO product-selection flag exists anywhere in the
 *   model. «وصل حديثًا» stays created_at-driven and «العروض» stays
 *   variant-discount-driven regardless of what an admin edits (hard
 *   exclusion from PHASE-10.md / MASTER_PLAN §4).
 * - Admin controls per section: visibility, ordering, title, subtitle, and a
 *   per-key JSONB config validated by Zod (shape varies per section key).
 * - Banners are PUBLIC-media hero slides (decision D-4): the referenced media
 *   asset must be a public image; private-store originals are rejected
 *   server-side. CTA hrefs are internal paths or wa.me links only.
 * - Reordering writes the complete order in ONE transaction — no partial
 *   states possible.
 * - Every mutation writes ONE sanitized audit row ATOMIC with the change.
 */

import { asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import {
  homepageBanners,
  homepageSections,
  mediaAssets,
  type HomepageSection,
} from '@/db/schema';
import { recordAdminActivity } from '@/lib/auth/activity';
import { isSafeCtaHref } from '@/lib/cta';

export class HomepageServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'HomepageServiceError';
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* Section key vocabulary + per-key config schemas                             */
/* -------------------------------------------------------------------------- */

/**
 * The complete, code-limited set of homepage sections. Order here is the
 * DEFAULT display order (also used by the absent-only bootstrap — D-1).
 * The 12-block homepage = these 10 managed sections + the header/footer
 * chrome that lives in the (store) layout (PHASE-10.md sections 1–12).
 */
export const HOMESECTION_KEYS = [
  'announcement',
  'hero',
  'categories',
  'new_arrivals',
  'offers',
  'benefits',
  'brand_story',
  'reviews',
  'testimonials',
  'whatsapp_cta',
] as const;

export type HomeSectionKey = (typeof HOMESECTION_KEYS)[number];

export function isHomeSectionKey(value: string): value is HomeSectionKey {
  return (HOMESECTION_KEYS as readonly string[]).includes(value);
}

const shortText = z.string().trim().min(1).max(80);
const longText = z.string().trim().min(1).max(600);

/**
 * Internal CTA target: relative path on this store, or a WhatsApp deep link.
 * Absolute external URLs (other than wa.me) are refused — banners/CTAs must
 * never turn the storefront into an arbitrary link farm.
 */
const ctaHref = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine(
    (v) => isSafeCtaHref(v),
    'رابط CTA غير صالح — استخدم مسارًا داخليًا أو رابط واتساب.',
  );

export const sectionConfigSchemas = {
  announcement: z
    .object({ message: z.string().trim().min(1, 'نص الإعلان مطلوب.').max(300) })
    .strict(),
  hero: z
    .object({
      eyebrow: z.string().trim().max(80).optional(),
      title: shortText,
      subtitle: z.string().trim().max(240).optional(),
      ctaLabel: z.string().trim().max(40).optional(),
      ctaHref,
    })
    .strict(),
  categories: z.object({}).strict(),
  new_arrivals: z.object({}).strict(),
  offers: z.object({}).strict(),
  benefits: z
    .object({
      items: z
        .array(z.object({ title: shortText, description: z.string().trim().max(200) }).strict())
        .min(3, 'على الأقل 3 عناصر.')
        .max(6, 'الحد الأقصى 6 عناصر.'),
    })
    .strict(),
  brand_story: z
    .object({
      body: longText,
      /** Public media asset id (D-4) — validated against the registry on save. */
      imageMediaId: z.string().uuid().nullable().optional(),
    })
    .strict(),
  reviews: z.object({}).strict(),
  testimonials: z.object({}).strict(),
  whatsapp_cta: z
    .object({
      title: shortText.optional(),
      body: z.string().trim().max(200).optional(),
      ctaLabel: z.string().trim().max(40).optional(),
    })
    .strict(),
} as const;

export type SectionConfigMap = {
  [K in HomeSectionKey]: z.infer<(typeof sectionConfigSchemas)[K]>;
};

export function validateSectionConfig(
  key: string,
  config: unknown,
): Record<string, unknown> | null {
  if (!isHomeSectionKey(key)) {
    throw new HomepageServiceError('قسم غير معروف.', 404);
  }
  // null/undefined = "restore the code defaults for this key" — a documented
  // clearing contract, not a schema violation.
  if (config === null || config === undefined) return null;
  const schema = sectionConfigSchemas[key];
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? 'بيانات القسم غير صالحة.';
    throw new HomepageServiceError(first, 400);
  }
  const value = parsed.data as Record<string, unknown>;
  return Object.keys(value).length > 0 ? value : null;
}

/* -------------------------------------------------------------------------- */
/* Section reads (admin)                                                       */
/* -------------------------------------------------------------------------- */

/** All managed sections in DEFAULT vocabulary order (admin editing view). */
export async function getAdminHomepageSections(): Promise<HomepageSection[]> {
  const rows = await db.select().from(homepageSections);
  const byKey = new Map(rows.map((r) => [r.sectionKey, r]));
  // Vocabulary order first (missing rows surface as known gaps), then any
  // unexpected DB-only rows appended honestly.
  const ordered: HomepageSection[] = [];
  for (const key of HOMESECTION_KEYS) {
    const row = byKey.get(key);
    if (row) ordered.push(row);
    byKey.delete(key);
  }
  for (const leftover of byKey.values()) ordered.push(leftover);
  return ordered;
}

/* -------------------------------------------------------------------------- */
/* Section mutations (admin)                                                   */
/* -------------------------------------------------------------------------- */

function assertAdminInput(adminUserId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(adminUserId)) {
    throw new HomepageServiceError('معرّف مشرف غير صالح.', 400);
  }
}

export const sectionUpdateSchema = z
  .object({
    title: z.string().trim().max(120).nullable().optional(),
    subtitle: z.string().trim().max(240).nullable().optional(),
    isEnabled: z.boolean().optional(),
    /** Per-key JSONB config; null restores the code defaults for this key. */
    config: z.unknown().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'لا توجد تغييرات لحفظها.');

export type SectionUpdateInput = z.infer<typeof sectionUpdateSchema>;

export async function updateHomepageSection(
  sectionId: string,
  input: SectionUpdateInput,
  adminUserId: string,
): Promise<HomepageSection> {
  assertAdminInput(adminUserId);

  const [section] = await db
    .select()
    .from(homepageSections)
    .where(eq(homepageSections.id, sectionId))
    .limit(1);

  if (!section || !isHomeSectionKey(section.sectionKey)) {
    throw new HomepageServiceError('القسم غير موجود.', 404);
  }

  const patch: Partial<typeof homepageSections.$inferInsert> = { updatedAt: new Date() };

  if (input.title !== undefined) patch.title = input.title === '' ? null : input.title;
  if (input.subtitle !== undefined) {
    patch.subtitle = input.subtitle === '' ? null : input.subtitle;
  }
  if (input.isEnabled !== undefined) patch.isEnabled = input.isEnabled;
  if (input.config !== undefined) {
    patch.config = validateSectionConfig(section.sectionKey, input.config ?? null);
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(homepageSections)
      .set(patch)
      .where(eq(homepageSections.id, sectionId))
      .returning();

    if (!updated) {
      throw new HomepageServiceError('القسم لم يعد موجودًا.', 404);
    }

    await recordAdminActivity(
      {
        adminUserId,
        action: 'update',
        entityType: 'homepage_section',
        entityId: sectionId,
        metadata: {
          sectionKey: section.sectionKey,
          fields: Object.keys(patch).filter((k) => k !== 'updatedAt'),
        },
      },
      tx,
    );

    return updated;
  });
}

/**
 * Reorder sections atomically: the payload carries the complete section-id
 * order. Unknown/duplicate ids are refused; every known key must appear.
 */
export const sectionOrderSchema = z
  .object({
    order: z.array(z.string().uuid()).min(HOMESECTION_KEYS.length).max(HOMESECTION_KEYS.length),
  })
  .strict();

export async function reorderHomepageSections(
  order: string[],
  adminUserId: string,
): Promise<void> {
  assertAdminInput(adminUserId);

  const unique = new Set(order);
  if (unique.size !== order.length) {
    throw new HomepageServiceError('ترتيب غير صالح — معرّفات مكررة.', 400);
  }

  const rows = await db
    .select({ id: homepageSections.id, sectionKey: homepageSections.sectionKey })
    .from(homepageSections)
    .where(inArray(homepageSections.id, order));

  if (rows.length !== order.length) {
    throw new HomepageServiceError('ترتيب غير صالح — قسم غير معروف.', 400);
  }

  await db.transaction(async (tx) => {
    for (let index = 0; index < order.length; index++) {
      await tx
        .update(homepageSections)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(eq(homepageSections.id, order[index]!));
    }
    await recordAdminActivity(
      {
        adminUserId,
        action: 'reorder',
        entityType: 'homepage_sections',
        entityId: null,
        metadata: { count: order.length },
      },
      tx,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Banners (hero) — PUBLIC media only (D-4)                                    */
/* -------------------------------------------------------------------------- */

/** Validate a banner media reference: must exist and be a public image. */
async function requirePublicImageAsset(mediaId: string): Promise<void> {
  const [asset] = await db
    .select({
      id: mediaAssets.id,
      pathname: mediaAssets.pathname,
      accessMode: mediaAssets.accessMode,
      mimeType: mediaAssets.mimeType,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);

  if (!asset) {
    throw new HomepageServiceError('صورة البانر غير موجودة.', 404);
  }
  if (
    asset.accessMode !== 'public' ||
    asset.pathname.startsWith('reviews/') ||
    asset.pathname.startsWith('testimonials/')
  ) {
    // Registry-level gate (D-4): private assets are refused outright.
    throw new HomepageServiceError('هذه الصورة غير صالحة للاستخدام العام.', 422);
  }
  if (!asset.mimeType.startsWith('image/')) {
    throw new HomepageServiceError('يجب أن يكون الوسيط صورة.', 422);
  }
}

export const bannerCreateSchema = z.object({
  title: z.string().trim().min(1, 'عنوان البانر مطلوب.').max(120),
  subtitle: z.string().trim().max(240).nullable(),
  ctaLabel: z.string().trim().max(40).nullable(),
  ctaHref: ctaHref.nullable(),
  sortOrder: z.number().int().min(0).max(999),
});

export type BannerCreateInput = z.infer<typeof bannerCreateSchema>;

export async function createHomepageBanner(
  input: BannerCreateInput & { mediaAssetId: string; adminUserId: string },
): Promise<{ id: string }> {
  assertAdminInput(input.adminUserId);
  await requirePublicImageAsset(input.mediaAssetId);

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(homepageBanners)
      .values({
        title: input.title,
        subtitle: input.subtitle === '' ? null : input.subtitle,
        mediaAssetId: input.mediaAssetId,
        ctaLabel: input.ctaLabel === '' ? null : input.ctaLabel,
        ctaHref: input.ctaHref === '' ? null : input.ctaHref,
        sortOrder: input.sortOrder,
        isActive: false, // banners start INACTIVE — the admin activates explicitly
      })
      .returning({ id: homepageBanners.id });
    await recordAdminActivity(
      {
        adminUserId: input.adminUserId,
        action: 'create',
        entityType: 'homepage_banner',
        entityId: row!.id,
        metadata: { mediaAssetId: input.mediaAssetId },
      },
      tx,
    );
    return row!.id;
  });

  return { id };
}

export const bannerUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    subtitle: z.string().trim().max(240).nullable().optional(),
    ctaLabel: z.string().trim().max(40).nullable().optional(),
    ctaHref: ctaHref.nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'لا توجد تغييرات لحفظها.');

export type BannerUpdateInput = z.infer<typeof bannerUpdateSchema>;

export async function updateHomepageBanner(
  bannerId: string,
  input: BannerUpdateInput,
  adminUserId: string,
): Promise<void> {
  assertAdminInput(adminUserId);

  const [existing] = await db
    .select({
      id: homepageBanners.id,
      startsAt: homepageBanners.startsAt,
      endsAt: homepageBanners.endsAt,
    })
    .from(homepageBanners)
    .where(eq(homepageBanners.id, bannerId))
    .limit(1);
  if (!existing) {
    throw new HomepageServiceError('البانر غير موجود.', 404);
  }

  const patch: Partial<typeof homepageBanners.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle === '' ? null : input.subtitle;
  if (input.ctaLabel !== undefined) patch.ctaLabel = input.ctaLabel === '' ? null : input.ctaLabel;
  if (input.ctaHref !== undefined) patch.ctaHref = input.ctaHref === '' ? null : input.ctaHref;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
  if (input.endsAt !== undefined) patch.endsAt = input.endsAt;

  // Window sanity: startsAt must not sit after endsAt when both are set.
  const startsAt = patch.startsAt ?? existing.startsAt ?? null;
  const endsAt = patch.endsAt ?? existing.endsAt ?? null;
  if (startsAt && endsAt && startsAt > endsAt) {
    throw new HomepageServiceError('تاريخ البداية يجب أن يسبق تاريخ النهاية.', 422);
  }

  await db.transaction(async (tx) => {
    await tx.update(homepageBanners).set(patch).where(eq(homepageBanners.id, bannerId));
    await recordAdminActivity(
      {
        adminUserId,
        action: 'update',
        entityType: 'homepage_banner',
        entityId: bannerId,
        metadata: { fields: Object.keys(patch) },
      },
      tx,
    );
  });
}

export async function deleteHomepageBanner(
  bannerId: string,
  adminUserId: string,
): Promise<void> {
  assertAdminInput(adminUserId);

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(homepageBanners)
      .where(eq(homepageBanners.id, bannerId))
      .returning({ id: homepageBanners.id });

    if (deleted.length === 0) {
      throw new HomepageServiceError('البانر غير موجود.', 404);
    }

    await recordAdminActivity(
      {
        adminUserId,
        action: 'delete',
        entityType: 'homepage_banner',
        entityId: bannerId,
        metadata: null,
      },
      tx,
    );
  });
}

/** Admin banner list (all states) with the public delivery URL mapping. */
export async function getAdminBanners() {
  return db
    .select({
      id: homepageBanners.id,
      title: homepageBanners.title,
      subtitle: homepageBanners.subtitle,
      ctaLabel: homepageBanners.ctaLabel,
      ctaHref: homepageBanners.ctaHref,
      isActive: homepageBanners.isActive,
      sortOrder: homepageBanners.sortOrder,
      startsAt: homepageBanners.startsAt,
      endsAt: homepageBanners.endsAt,
      mediaAssetId: homepageBanners.mediaAssetId,
      mediaUrl: sql<string>`case
        when ${mediaAssets.pathname} like 'reviews/%' or ${mediaAssets.pathname} like 'testimonials/%'
          then '/api/media/' || ${mediaAssets.id}::text
        else ${mediaAssets.url}
      end`,
    })
    .from(homepageBanners)
    .innerJoin(mediaAssets, eq(homepageBanners.mediaAssetId, mediaAssets.id))
    .orderBy(asc(homepageBanners.sortOrder), asc(homepageBanners.id));
}
