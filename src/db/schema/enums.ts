/**
 * Amira Store — PostgreSQL enum definitions (Drizzle).
 *
 * Source of truth: docs/DATA_DICTIONARY.md + MASTER_PLAN.md §12/§15/§26.
 * Enum value sets are frozen here; adding a value later requires a migration.
 */

import { pgEnum } from 'drizzle-orm/pg-core';

/** Product lifecycle: draft is not public, archived is soft-delete (history-safe). */
export const productStatusEnum = pgEnum('product_status', [
  'draft',
  'active',
  'archived',
]);

/** MASTER_PLAN §2: Cash on Delivery is the only payment method. */
export const paymentMethodEnum = pgEnum('payment_method', ['cod']);

/** Collection state of the COD amount (tracked by admin). */
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'collected',
  'failed',
]);

/** MASTER_PLAN §12 order status. */
export const orderStatusEnum = pgEnum('order_status', [
  'new',
  'under_review',
  'confirmed',
  'preparing',
  'completed',
  'canceled',
]);

/** MASTER_PLAN §12 shipping status (independent from order status). */
export const shippingStatusEnum = pgEnum('shipping_status', [
  'not_started',
  'preparing',
  'ready_to_ship',
  'shipped',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returned_to_stock',
]);

/** MASTER_PLAN §13 auditable inventory ledger movement types. */
export const inventoryMovementTypeEnum = pgEnum('inventory_movement_type', [
  'opening',
  'sale',
  'cancellation_return',
  'manual_adjustment',
  'order_edit_increase',
  'order_edit_decrease',
  'other',
]);

/** Review moderation states (MASTER_PLAN §15). */
export const reviewStatusEnum = pgEnum('review_status', [
  'pending',
  'approved',
  'rejected',
]);

/** WhatsApp testimonial publishing states (MASTER_PLAN §15). */
export const testimonialStatusEnum = pgEnum('testimonial_status', [
  'draft',
  'published',
  'hidden',
]);

/** Media access mode — public catalog media vs. private admin-only originals. */
export const mediaAccessModeEnum = pgEnum('media_access_mode', [
  'public',
  'private',
]);
