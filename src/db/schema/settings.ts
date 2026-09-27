/**
 * Amira Store — editable store settings + homepage content.
 *
 * Source: docs/DATA_DICTIONARY.md (store_settings, homepage_sections,
 * homepage_banners) + MASTER_PLAN §4/§10 + PHASE-10 (consumer).
 *
 * Business rules encoded here:
 * - store_settings is a TRUE single-row table (id pinned to 1 by CHECK) —
 *   business settings live in DATA, never in code constants (the WhatsApp
 *   number +201019003677 is seeded as store data per PHASE-02 task 15);
 * - no secret credentials in this table (only business configuration);
 * - homepage section keys are limited BY CODE (not by DB check) so content
 *   evolves without migrations; product-driven sections remain query-driven —
 *   no product-selection flags exist anywhere in the schema.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { mediaAssets } from './media';

export const storeSettings = pgTable(
  'store_settings',
  {
    /** Singleton enforcement: primary key pinned to 1. */
    id: integer('id').primaryKey().default(1),
    storeName: text('store_name').notNull(),
    logoMediaId: uuid('logo_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    faviconMediaId: uuid('favicon_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    /** Business data, editable from Admin (PHASE-02 task 15). International format. */
    whatsappPhone: text('whatsapp_phone').notNull(),
    /** Template consumed by the WhatsApp message builder (PHASE-07). */
    whatsappMessageTemplate: text('whatsapp_message_template').notNull(),
    supportPhone: text('support_phone'),
    footerText: text('footer_text'),
    /** e.g. {"instagram":"https://...","facebook":"https://..."} */
    socialLinks: jsonb('social_links'),
    currencyCode: text('currency_code').notNull().default('EGP'),
    locale: text('locale').notNull().default('ar'),
    timezone: text('timezone').notNull().default('Africa/Cairo'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('store_settings_singleton', sql`id = 1`),
    check(
      'store_settings_whatsapp_phone_nonempty',
      sql`length(trim(whatsapp_phone)) > 0`,
    ),
    check(
      'store_settings_store_name_nonempty',
      sql`length(trim(store_name)) > 0`,
    ),
  ],
);

export const homepageSections = pgTable(
  'homepage_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Code-limited key vocabulary (e.g. "new_arrivals", "offers", "hero"). */
    sectionKey: text('section_key').notNull(),
    title: text('title'),
    subtitle: text('subtitle'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    config: jsonb('config'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('homepage_sections_key_key').on(t.sectionKey),
    index('idx_homepage_sections_sort').on(t.isEnabled, t.sortOrder),
  ],
);

export const homepageBanners = pgTable(
  'homepage_banners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    ctaLabel: text('cta_label'),
    ctaHref: text('cta_href'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_homepage_banners_active').on(t.isActive, t.sortOrder),
    check('homepage_banners_title_nonempty', sql`length(trim(title)) > 0`),
  ],
);

export type StoreSettings = typeof storeSettings.$inferSelect;
export type HomepageSection = typeof homepageSections.$inferSelect;
export type HomepageBanner = typeof homepageBanners.$inferSelect;
