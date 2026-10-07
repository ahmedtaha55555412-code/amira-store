/**
 * Amira Store — reviews + WhatsApp testimonials (two DISTINCT social-proof
 * domains, per MASTER_PLAN §15: a WhatsApp screenshot is never a site review).
 *
 * Source: docs/DATA_DICTIONARY.md (reviews, review_images,
 * whatsapp_testimonials) + PHASE-09 (consumer).
 *
 * Business invariants encoded here:
 * - rating 1..5 (DB-checked);
 * - at most one VERIFIED review per order item (partial unique index);
 * - reviews are moderated (pending default; only approved become public);
 * - testimonials are a separate entity with their own publish workflow.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { reviewStatusEnum, testimonialStatusEnum } from './enums';
import { products } from './catalog';
import { customers, orderItems } from './customers-orders';
import { mediaAssets } from './media';

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    /** Set when the review was written against a delivered order item (verified flow). */
    orderItemId: uuid('order_item_id').references(() => orderItems.id, {
      onDelete: 'restrict',
    }),
    customerId: uuid('customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),
    rating: smallint('rating').notNull(),
    comment: text('comment').notNull(),
    status: reviewStatusEnum('status').notNull().default('pending'),
    isVerifiedPurchase: boolean('is_verified_purchase').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Product review lookups (PHASE-02 task 9): approved-first product feeds.
    index('idx_reviews_product_status').on(t.productId, t.status, t.createdAt.desc()),
    index('idx_reviews_order_item').on(t.orderItemId),
    index('idx_reviews_status').on(t.status),
    foreignKey({
      name: 'reviews_order_item_product_fk',
      columns: [t.orderItemId, t.productId],
      foreignColumns: [orderItems.id, orderItems.productId],
    }).onDelete('restrict'),

    // Dictionary rule: one review per order_item for VERIFIED reviews only.
    // Unlinked (unverified) reviews stay unrestricted.
    uniqueIndex('reviews_order_item_verified_key')
      .on(t.orderItemId)
      .where(sql`order_item_id IS NOT NULL AND is_verified_purchase`),

    check('reviews_rating_range', sql`rating BETWEEN 1 AND 5`),
    check('reviews_comment_nonempty', sql`length(trim(comment)) > 0`),
  ],
);

export const reviewImages = pgTable(
  'review_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    uniqueIndex('review_images_review_media_key').on(t.reviewId, t.mediaAssetId),
    index('idx_review_images_review').on(t.reviewId, t.sortOrder),
  ],
);

export const whatsappTestimonials = pgTable(
  'whatsapp_testimonials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Optional link to a related product (SET NULL if the product ever goes). */
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    displayName: text('display_name'),
    city: text('city'),
    caption: text('caption'),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    status: testimonialStatusEnum('status').notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Homepage testimonial feed: published items in display order.
    index('idx_whatsapp_testimonials_status').on(t.status, t.sortOrder),
    index('idx_whatsapp_testimonials_product').on(t.productId),
  ],
);

export type Review = typeof reviews.$inferSelect;
export type ReviewImage = typeof reviewImages.$inferSelect;
export type WhatsappTestimonial = typeof whatsappTestimonials.$inferSelect;
