/**
 * Amira Store — store settings admin service (PHASE-10).
 *
 * The singleton `store_settings` row (id pinned to 1) is the editable source
 * of store branding/communication data (MASTER_PLAN §26; docs/DATA_DICTIONARY.md).
 * Business rules encoded here:
 *
 * - The row is DATA, never secrets (no credentials in this table).
 * - Every storefront surface reads settings through {@link getResolvedBrandSettings}
 *   and falls back to the PHASE-01 compile-time BRAND defaults when a field is
 *   unset — components never hard-code brand data (PHASE-01 contract).
 * - Logo/favicon may reference PUBLIC media assets ONLY (PHASE-10 decision
 *   D-4): the server validates access_mode before assignment — the PHASE-09
 *   private-media architecture is untouched and private originals can never
 *   reach public branding surfaces.
 * - The WhatsApp number is validated with the same Egyptian-normalization
 *   rule the storefront uses (single source of truth; checkout keeps reading
 *   this column as the order-creation truth — PHASE-07 contract unchanged).
 * - Every mutation writes ONE sanitized audit row ATOMIC with the change.
 */

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { homepageSections, mediaAssets, storeSettings } from '@/db/schema';
import { recordAdminActivity } from '@/lib/auth/activity';
import { normalizeEgyptianPhone } from '@/lib/storefront/whatsapp';

export class SettingsServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'SettingsServiceError';
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* Social links vocabulary (code-limited; no arbitrary href injection)         */
/* -------------------------------------------------------------------------- */

export const SOCIAL_LINK_KEYS = ['instagram', 'facebook', 'tiktok'] as const;
export type SocialLinkKey = (typeof SOCIAL_LINK_KEYS)[number];

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .url('رابط غير صالح.')
  .refine((v) => v.startsWith('https://'), 'يجب أن يكون الرابط https://');

export const socialLinksSchema = z
  .object({
    instagram: httpsUrl.optional(),
    facebook: httpsUrl.optional(),
    tiktok: httpsUrl.optional(),
  })
  .strict();

export type SocialLinks = Partial<Record<SocialLinkKey, string>>;

function parseSocialLinks(value: unknown): SocialLinks {
  if (value === null || value === undefined) return {};
  const parsed = socialLinksSchema.safeParse(value);
  if (!parsed.success) return {};
  return parsed.data;
}

/* -------------------------------------------------------------------------- */
/* Settings update schema                                                      */
/* -------------------------------------------------------------------------- */

export const settingsUpdateSchema = z
  .object({
    storeName: z.string().trim().min(1, 'اسم المتجر مطلوب.').max(80).optional(),
    /** International Egyptian mobile; normalized to +20… before storage. */
    whatsappPhone: z.string().trim().max(24).optional(),
    whatsappMessageTemplate: z
      .string()
      .trim()
      .min(1, 'قالب رسالة واتساب مطلوب.')
      .max(2000)
      .optional(),
    /** null clears; empty string clears. */
    supportPhone: z
      .string()
      .trim()
      .max(24)
      .nullable()
      .transform((v) => (v === '' ? null : v))
      .optional(),
    footerText: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .transform((v) => (v === '' ? null : v))
      .optional(),
    socialLinks: socialLinksSchema.nullable().optional(),
    /**
     * Display-context settings (PHASE-12). The storefront language, currency,
     * and timezone are FIXED business scope (MASTER_PLAN §2/§32: Arabic-only,
     * EGP, Egypt) — the schema accepts exactly those canonical values so the
     * stored row, the API, and the display layer stay in provable agreement;
     * anything else is refused with an explicit Arabic error. Changing the
     * business scope is an owner decision, not a settings edit.
     */
    currencyCode: z.literal('EGP', {
      message: 'عملة المتجر ثابتة: الجنيه المصري (EGP) وفق نطاق العمل.',
    }).optional(),
    locale: z.literal('ar', {
      message: 'لغة المتجر ثابتة: العربية (ar) وفق نطاق العمل.',
    }).optional(),
    timezone: z.literal('Africa/Cairo', {
      message: 'المنطقة الزمنية ثابتة: القاهرة (Africa/Cairo) وفق نطاق العمل.',
    }).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'لا توجد تغييرات لحفظها.');

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

/** Media-assignment schemas (logo / favicon) — public assets only (D-4). */
export const settingsMediaSchema = z
  .object({
    /** Public media asset id; null resets to the built-in brand default. */
    mediaId: z.string().uuid().nullable(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export type StoreSettingsRow = typeof storeSettings.$inferSelect;

/** Read the singleton row; `null` when absent (bootstrap owns creation). */
export async function getStoreSettings(): Promise<StoreSettingsRow | null> {
  const [row] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.id, 1))
    .limit(1);
  return row ?? null;
}

/** Resolve a media reference to a URL — PUBLIC assets only, enforced here. */
function publicMediaUrl(
  asset: Pick<typeof mediaAssets.$inferSelect, 'id' | 'pathname' | 'url' | 'accessMode'> | null,
): string | null {
  if (!asset) return null;
  if (asset.accessMode !== 'public') return null;
  // Defense in depth: private-store pathnames are never exposed by this
  // resolver even if a bad reference slipped in (D-4; PHASE-09 model intact).
  if (
    asset.pathname.startsWith('reviews/') ||
    asset.pathname.startsWith('testimonials/')
  ) {
    return null;
  }
  return asset.url;
}

/**
 * Resolve the settings row into the full storefront branding contract.
 * Falls back per-field to the compile-time BRAND defaults — the resolver is
 * the ONLY place where defaults and DB data meet (PHASE-01 contract).
 */
export async function getResolvedBrandSettings() {
  const [row] = await db
    .select({
      settings: storeSettings,
      logo: {
        id: mediaAssets.id,
        pathname: mediaAssets.pathname,
        url: mediaAssets.url,
        accessMode: mediaAssets.accessMode,
      },
    })
    .from(storeSettings)
    .leftJoin(
      mediaAssets,
      and(
        eq(storeSettings.logoMediaId, mediaAssets.id),
        eq(mediaAssets.accessMode, 'public'),
      ),
    )
    .limit(1);

  if (!row) return null;

  // The favicon reference is fetched explicitly when set (a second distinct
  // media read — the logo join above must not shadow it).
  let favicon: { id: string; pathname: string; url: string; accessMode: 'public' | 'private' } | null = null;
  if (row.settings.faviconMediaId) {
    const [asset] = await db
      .select({
        id: mediaAssets.id,
        pathname: mediaAssets.pathname,
        url: mediaAssets.url,
        accessMode: mediaAssets.accessMode,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, row.settings.faviconMediaId),
          eq(mediaAssets.accessMode, 'public'),
        ),
      )
      .limit(1);
    favicon = asset ?? null;
  }

  // Announcement copy (D-2): homepage_sections.announcement.config.message,
  // falling back to the BRAND default.
  const [announcementSection] = await db
    .select({ config: homepageSections.config, isEnabled: homepageSections.isEnabled })
    .from(homepageSections)
    .where(eq(homepageSections.sectionKey, 'announcement'))
    .limit(1);

  const announcementConfig = (announcementSection?.config ?? null) as
    | { message?: unknown }
    | null;
  const announcementMessage =
    typeof announcementConfig?.message === 'string' && announcementConfig.message.trim()
      ? announcementConfig.message.trim().slice(0, 300)
      : null;

  return {
    settings: row.settings,
    logoUrl: publicMediaUrl(row.logo),
    faviconUrl: publicMediaUrl(favicon),
    announcementMessage,
    announcementEnabled: announcementSection?.isEnabled ?? true,
    socialLinks: parseSocialLinks(row.settings.socialLinks),
  };
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

function assertAdminInput(adminUserId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(adminUserId)) {
    throw new SettingsServiceError('معرّف مشرف غير صالح.', 400);
  }
}

/** Validate a media reference exists AND is a public image (D-4 gate). */
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
    throw new SettingsServiceError('الوسيط المطلوب غير موجود.', 404);
  }
  if (
    asset.accessMode !== 'public' ||
    asset.pathname.startsWith('reviews/') ||
    asset.pathname.startsWith('testimonials/')
  ) {
    // Private-store originals can never back a public branding surface.
    throw new SettingsServiceError('هذا الوسيط غير صالح للاستخدام العام.', 422);
  }
  if (!asset.mimeType.startsWith('image/')) {
    throw new SettingsServiceError('يجب أن يكون الوسيط صورة.', 422);
  }
}

export async function updateStoreSettings(
  input: SettingsUpdateInput,
  adminUserId: string,
): Promise<StoreSettingsRow> {
  assertAdminInput(adminUserId);

  const current = await getStoreSettings();
  if (!current) {
    throw new SettingsServiceError(
      'إعدادات المتجر غير مهيأة — شغّل تهيئة قاعدة البيانات أولًا.',
      503,
    );
  }

  const patch: Partial<typeof storeSettings.$inferInsert> = { updatedAt: new Date() };

  if (input.storeName !== undefined) patch.storeName = input.storeName;

  if (input.whatsappPhone !== undefined) {
    const normalized = normalizeEgyptianPhone(input.whatsappPhone);
    if (!normalized) {
      throw new SettingsServiceError(
        'رقم واتساب غير صالح — أدخل رقم موبايل مصري بصيغة صحيحة.',
        422,
      );
    }
    patch.whatsappPhone = normalized;
  }

  if (input.whatsappMessageTemplate !== undefined) {
    patch.whatsappMessageTemplate = input.whatsappMessageTemplate;
  }
  if (input.supportPhone !== undefined) {
    if (input.supportPhone !== null) {
      const normalized = normalizeEgyptianPhone(input.supportPhone);
      if (!normalized) {
        throw new SettingsServiceError(
          'رقم الدعم غير صالح — أدخل رقم موبايل مصري بصيغة صحيحة.',
          422,
        );
      }
      patch.supportPhone = normalized;
    } else {
      patch.supportPhone = null;
    }
  }
  if (input.footerText !== undefined) patch.footerText = input.footerText;
  if (input.socialLinks !== undefined) {
    patch.socialLinks = input.socialLinks === null ? null : input.socialLinks;
  }
  // Display-context fields (PHASE-12): validated to the canonical business
  // values by the schema; persisting them keeps row/api/display in agreement.
  if (input.currencyCode !== undefined) patch.currencyCode = input.currencyCode;
  if (input.locale !== undefined) patch.locale = input.locale;
  if (input.timezone !== undefined) patch.timezone = input.timezone;

  // Audit ATOMIC with the change; the singleton row is identified by its
  // entityType + metadata (entity_id is a uuid column — an integer id does
  // not belong there).
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(storeSettings)
      .set(patch)
      .where(eq(storeSettings.id, 1))
      .returning();

    await recordAdminActivity(
      {
        adminUserId,
        action: 'update',
        entityType: 'store_settings',
        entityId: null,
        metadata: {
          singleton: 1,
          fields: Object.keys(patch).filter((k) => k !== 'updatedAt'),
        },
      },
      tx,
    );

    return row!;
  });

  return updated;
}

/** Assign (or reset) the store logo — public image assets only (D-4). */
export async function updateStoreLogo(
  mediaId: string | null,
  adminUserId: string,
): Promise<void> {
  assertAdminInput(adminUserId);
  if (mediaId) await requirePublicImageAsset(mediaId);

  const current = await getStoreSettings();
  if (!current) {
    throw new SettingsServiceError(
      'إعدادات المتجر غير مهيأة — شغّل تهيئة قاعدة البيانات أولًا.',
      503,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(storeSettings)
      .set({ logoMediaId: mediaId, updatedAt: new Date() })
      .where(eq(storeSettings.id, 1));

    await recordAdminActivity(
      {
        adminUserId,
        action: 'update',
        entityType: 'store_settings',
        entityId: null,
        metadata: { singleton: 1, fields: ['logoMediaId'], mediaId },
      },
      tx,
    );
  });
}

/** Assign (or reset) the store favicon — public image assets only (D-4). */
export async function updateStoreFavicon(
  mediaId: string | null,
  adminUserId: string,
): Promise<void> {
  assertAdminInput(adminUserId);
  if (mediaId) await requirePublicImageAsset(mediaId);

  const current = await getStoreSettings();
  if (!current) {
    throw new SettingsServiceError(
      'إعدادات المتجر غير مهيأة — شغّل تهيئة قاعدة البيانات أولًا.',
      503,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(storeSettings)
      .set({ faviconMediaId: mediaId, updatedAt: new Date() })
      .where(eq(storeSettings.id, 1));

    await recordAdminActivity(
      {
        adminUserId,
        action: 'update',
        entityType: 'store_settings',
        entityId: null,
        metadata: { singleton: 1, fields: ['faviconMediaId'], mediaId },
      },
      tx,
    );
  });
}
