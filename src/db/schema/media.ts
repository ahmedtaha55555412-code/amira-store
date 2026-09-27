/**
 * Amira Store — media asset registry.
 *
 * Source: docs/DATA_DICTIONARY.md (media_assets) + MASTER_PLAN §20.
 *
 * This table is the DATABASE side of the media service abstraction: rows are
 * metadata about objects stored in a provider (initially Vercel Blob). The
 * provider implementation itself lives behind the media service (PHASE-04+).
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
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

import { mediaAccessModeEnum } from './enums';
import { adminUsers } from './admin';

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Storage provider id — initially 'vercel_blob'; isolated for future providers. */
    provider: text('provider').notNull().default('vercel_blob'),
    /** Provider-unique pathname (e.g. "products/<uuid>/main.webp"). */
    pathname: text('pathname').notNull(),
    /** Public or signed URL at registration time. */
    url: text('url').notNull(),
    accessMode: mediaAccessModeEnum('access_mode').notNull().default('public'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    width: integer('width'),
    height: integer('height'),
    altText: text('alt_text'),
    metadata: jsonb('metadata'),
    createdByAdminId: uuid('created_by_admin_id').references(
      () => adminUsers.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('media_assets_pathname_key').on(t.pathname),
    check('media_assets_size_nonnegative', sql`size_bytes >= 0`),
    index('idx_media_assets_created').on(t.createdAt),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
