/**
 * Amira Store — catalog domain tables.
 *
 * Source: docs/DATA_DICTIONARY.md (categories, products, attributes,
 * attribute_values, product_variants, variant_attribute_values,
 * product_images, size_guides, size_guide_rows) + MASTER_PLAN §6/§7/§17.
 *
 * Business invariants encoded here (PHASE-02 "critical business invariants"):
 * - unique slugs (categories, products, attributes);
 * - unique SKU;
 * - no negative stock;
 * - variant prices positive; current price is the actual sell price;
 * - size is NOT coupled to color: attributes are generic, variants reference
 *   only the attribute values that actually apply — no forced Cartesian matrix;
 * - a variant cannot carry two values of the SAME attribute (DB-enforced via
 *   UNIQUE(variant_id, attribute_id) on the denormalized attribute_id);
 * - products are soft-deleted (archived) so order history stays referential.
 */

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { productStatusEnum } from './enums';
import { mediaAssets } from './media';

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Self-FK parent/child tree. RESTRICT: re-parent children before deleting a parent. */
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'restrict',
    }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    imageMediaId: uuid('image_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('categories_slug_key').on(t.slug),
    // Category hierarchy + storefront ordering lookups.
    index('idx_categories_parent').on(t.parentId),
    check('categories_name_nonempty', sql`length(trim(name)) > 0`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    shortDescription: text('short_description'),
    description: text('description'),
    status: productStatusEnum('status').notNull().default('draft'),
    metaTitle: text('meta_title'),
    metaDescription: text('meta_description'),
    /**
     * Data-dictionary decision: the dictionary allows "canonical_slug/url as
     * appropriate". We store the domain-independent slug; the absolute URL is
     * constructed at render time so SEO stays correct across domains.
     */
    canonicalSlug: text('canonical_slug'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('products_slug_key').on(t.slug),
    // Storefront category listings + admin filters.
    index('idx_products_category_status').on(t.categoryId, t.status),
    // New Arrivals: newest-first by real creation time (MASTER_PLAN §4) — no flags.
    index('idx_products_created_at_desc').on(t.createdAt.desc()),
    check('products_name_nonempty', sql`length(trim(name)) > 0`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Attributes / attribute values (generic, reusable)                           */
/* -------------------------------------------------------------------------- */

export const attributes = pgTable(
  'attributes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    uniqueIndex('attributes_slug_key').on(t.slug),
    check('attributes_name_nonempty', sql`length(trim(name)) > 0`),
  ],
);

export const attributeValues = pgTable(
  'attribute_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    slug: text('slug').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    // Dictionary rule: UNIQUE(attribute_id, slug) — no duplicate value per attribute.
    uniqueIndex('attribute_values_attribute_slug_key').on(
      t.attributeId,
      t.slug,
    ),
    // Target for the composite FK from variant_attribute_values (see below).
    uniqueIndex('attribute_values_id_attribute_key').on(t.id, t.attributeId),
    check('attribute_values_value_nonempty', sql`length(trim(value)) > 0`),
    index('idx_attribute_values_attribute').on(t.attributeId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Product variants (independently addressable sellable units)                 */
/* -------------------------------------------------------------------------- */

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    /** Pre-discount / reference price. */
    originalPrice: numeric('original_price', { precision: 12, scale: 2 })
      .notNull(),
    /** Actual current sell price — source of truth for checkout (MASTER_PLAN §7). */
    currentPrice: numeric('current_price', { precision: 12, scale: 2 })
      .notNull(),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(3),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('product_variants_sku_key').on(t.sku),
    // Variant lists per product + active filtering.
    index('idx_product_variants_product').on(t.productId, t.isActive),
    // Low-stock / out-of-stock admin views.
    index('idx_product_variants_stock').on(t.stockQuantity),
    // Offers section: variants with an actual discount (MASTER_PLAN §4) — data-driven, no flags.
    index('idx_product_variants_offers')
      .on(t.productId, t.currentPrice)
      .where(sql`is_active AND current_price < original_price`),
    check(
      'product_variants_original_price_positive',
      sql`original_price > 0`,
    ),
    check('product_variants_current_price_positive', sql`current_price > 0`),
    check('product_variants_stock_nonnegative', sql`stock_quantity >= 0`),
    check(
      'product_variants_low_stock_threshold_nonnegative',
      sql`low_stock_threshold >= 0`,
    ),
  ],
);

/**
 * Variant ↔ attribute-value many-to-many.
 *
 * Dictionary decision (documented in DATA_DICTIONARY.md): besides the
 * composite PK (variant_id, attribute_value_id), we store the denormalized
 * `attribute_id` guarded by a composite FK to attribute_values(id, attribute_id)
 * plus UNIQUE(variant_id, attribute_id). This enforces the documented invariant
 * "one value per attribute per variant" at the DATABASE level — concurrency-safe
 * for later checkout/order-edit phases — without coupling size to color.
 */
export const variantAttributeValues = pgTable(
  'variant_attribute_values',
  {
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    attributeValueId: uuid('attribute_value_id')
      .notNull()
      .references(() => attributeValues.id, { onDelete: 'cascade' }),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({
      name: 'variant_attribute_values_pkey',
      columns: [t.variantId, t.attributeValueId],
    }),
    uniqueIndex('variant_attribute_values_variant_attribute_key').on(
      t.variantId,
      t.attributeId,
    ),
    // Composite FK: guarantees the denormalized attribute_id IS the attribute
    // of the referenced value (no mismatched value/attribute pairs possible).
    foreignKey({
      name: 'variant_attribute_values_value_attribute_pair_fk',
      columns: [t.attributeValueId, t.attributeId],
      foreignColumns: [attributeValues.id, attributeValues.attributeId],
    }),
  ],
);

/* -------------------------------------------------------------------------- */
/* Product images (gallery + optional variant-specific images)                 */
/* -------------------------------------------------------------------------- */

export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** NULL = product-level gallery image; set = variant-specific image. */
    variantId: uuid('variant_id').references(() => productVariants.id, {
      onDelete: 'cascade',
    }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    altText: text('alt_text'),
  },
  (t) => [
    index('idx_product_images_product').on(t.productId, t.sortOrder),
    index('idx_product_images_variant').on(t.variantId),
    index('idx_product_images_media').on(t.mediaAssetId),
    // Exactly one primary image per product (gallery level).
    uniqueIndex('product_images_product_primary_key')
      .on(t.productId)
      .where(sql`is_primary AND variant_id IS NULL`),
    // At most one primary image per variant.
    uniqueIndex('product_images_variant_primary_key')
      .on(t.variantId)
      .where(sql`is_primary AND variant_id IS NOT NULL`),
    // Same media cannot be attached twice at the same level (gallery /
    // variant) — makes catalog edits and seeds naturally idempotent.
    uniqueIndex('product_images_product_media_key')
      .on(t.productId, t.mediaAssetId)
      .where(sql`variant_id IS NULL`),
    uniqueIndex('product_images_variant_media_key')
      .on(t.variantId, t.mediaAssetId)
      .where(sql`variant_id IS NOT NULL`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Size guides (optional, clothing only)                                       */
/* -------------------------------------------------------------------------- */

export const sizeGuides = pgTable(
  'size_guides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    title: text('title'),
    notes: text('notes'),
  },
  (t) => [
    // Dictionary: one size guide per product (1:1).
    uniqueIndex('size_guides_product_key').on(t.productId),
  ],
);

export const sizeGuideRows = pgTable(
  'size_guide_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sizeGuideId: uuid('size_guide_id')
      .notNull()
      .references(() => sizeGuides.id, { onDelete: 'cascade' }),
    sizeLabel: text('size_label').notNull(),
    /** Flexible measurement map, e.g. {"bust":"88cm","waist":"70cm","length":"100cm"}. */
    measurements: jsonb('measurements').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('idx_size_guide_rows_guide').on(t.sizeGuideId, t.sortOrder),
  ],
);

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Attribute = typeof attributes.$inferSelect;
export type AttributeValue = typeof attributeValues.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type VariantAttributeValue = typeof variantAttributeValues.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type SizeGuide = typeof sizeGuides.$inferSelect;
export type SizeGuideRow = typeof sizeGuideRows.$inferSelect;

/* Relations for this file's tables are declared centrally in ./relations.ts
   (drizzle evaluates one()/many() eagerly; a central file avoids circular
   module-evaluation failures between catalog ↔ reviews ↔ inventory). */
