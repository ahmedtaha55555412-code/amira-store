/**
 * Amira Store — customers, orders, order items (historical snapshots).
 *
 * Source: docs/DATA_DICTIONARY.md (customers, orders, order_items) +
 * MASTER_PLAN §9/§10/§11/§14 + PHASE-07/PHASE-08 (consumers).
 *
 * Business invariants encoded here:
 * - customer identity = normalized phone (guest model, no accounts/passwords);
 * - order/customer snapshots preserve historical truth — totals NEVER re-derive
 *   from current catalog data;
 * - order monetary values nonnegative; grand_total ≡ products_total + shipping;
 * - order items: positive quantity, positive unit prices,
 *   subtotal = unit_price × quantity (DB-checked);
 * - one order line per variant per order (quantities merge at checkout);
 * - shipping cost is nullable until confirmed via WhatsApp (MASTER_PLAN §11);
 * - order status and shipping status are SEPARATE enums;
 * - idempotency_key reserves a place for the checkout deduplication contract
 *   (PHASE-07) so duplicate submissions can never create a second order.
 */

import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  orderStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  shippingStatusEnum,
} from './enums';
import { products, productVariants } from './catalog';

/* -------------------------------------------------------------------------- */
/* Customers (guest model — identity by normalized phone)                      */
/* -------------------------------------------------------------------------- */

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Phone as typed by the customer (display). */
    phone: text('phone').notNull(),
    /** App-normalized phone (digits, international form) — the upsert key. */
    phoneNormalized: text('phone_normalized').notNull(),
    /** Last address used — convenience for repeat checkout only; orders keep snapshots. */
    addressLastUsed: text('address_last_used'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Data-dictionary decision: phone_normalized is UNIQUE (not just indexed).
    // MASTER_PLAN §10 requires "create/update customer record by normalized
    // phone" — uniqueness turns that into a race-safe upsert and prevents
    // duplicate customer rows. Order snapshots keep history independent.
    uniqueIndex('customers_phone_normalized_key').on(t.phoneNormalized),
    index('idx_customers_name').on(t.name),
  ],
);

/* -------------------------------------------------------------------------- */
/* Orders                                                                      */
/* -------------------------------------------------------------------------- */

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Customer-facing order number (e.g. "AMR-XXXXXX") — tracking key. */
    orderNumber: text('order_number').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),

    orderStatus: orderStatusEnum('order_status').notNull().default('new'),
    shippingStatus: shippingStatusEnum('shipping_status')
      .notNull()
      .default('not_started'),
    paymentMethod: paymentMethodEnum('payment_method').notNull().default('cod'),
    paymentStatus: paymentStatusEnum('payment_status')
      .notNull()
      .default('pending'),

    productsTotal: numeric('products_total', { precision: 12, scale: 2 })
      .notNull(),
    /** NULL until shipping is agreed through WhatsApp (MASTER_PLAN §11). */
    shippingCost: numeric('shipping_cost', { precision: 12, scale: 2 }),
    grandTotal: numeric('grand_total', { precision: 12, scale: 2 }).notNull(),

    /* ---- Historical snapshots (never re-derived from catalog/customer) ---- */
    addressSnapshot: text('address_snapshot').notNull(),
    customerNameSnapshot: text('customer_name_snapshot').notNull(),
    customerPhoneSnapshot: text('customer_phone_snapshot').notNull(),
    /** WhatsApp number active at order time (editable setting → snapshot). */
    whatsappPhoneSnapshot: text('whatsapp_phone_snapshot').notNull(),

    notes: text('notes'),
    /**
     * Checkout idempotency (PHASE-07 contract slot): at most one order per
     * client idempotency key; NULL allowed for non-checkout provenance.
     */
    idempotencyKey: text('idempotency_key'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_order_number_key').on(t.orderNumber),
    uniqueIndex('orders_idempotency_key_unique')
      .on(t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),

    // Admin order lists / filters (status columns per PHASE-02 task 9).
    index('idx_orders_status').on(t.orderStatus, t.createdAt.desc()),
    index('idx_orders_shipping_status').on(t.shippingStatus),
    index('idx_orders_payment_status').on(t.paymentStatus),
    index('idx_orders_customer').on(t.customerId),
    // Tracking + admin phone search use the checkout phone snapshot.
    index('idx_orders_phone_snapshot').on(t.customerPhoneSnapshot),

    check('orders_products_total_nonnegative', sql`products_total >= 0`),
    check('orders_shipping_cost_nonnegative', sql`shipping_cost IS NULL OR shipping_cost >= 0`),
    check('orders_grand_total_nonnegative', sql`grand_total >= 0`),
    // Monetary identity enforced end-to-end (MASTER_PLAN §11 totals flow).
    check(
      'orders_grand_total_identity',
      sql`grand_total = products_total + COALESCE(shipping_cost, 0)`,
    ),
    check(
      'orders_customer_name_snapshot_nonempty',
      sql`length(trim(customer_name_snapshot)) > 0`,
    ),
    check(
      'orders_customer_phone_snapshot_nonempty',
      sql`length(trim(customer_phone_snapshot)) > 0`,
    ),
    check(
      'orders_address_snapshot_nonempty',
      sql`length(trim(address_snapshot)) > 0`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Order items (full per-line snapshots)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Shape of the attribute snapshot written at order time, e.g.
 * `[{"attribute":"size","value":"M","valueSlug":"m"},
 *   {"attribute":"color","value":"أسود","valueSlug":"black"}]`
 */
export type OrderItemAttributeSnapshot = {
  attribute: string;
  value: string;
  valueSlug: string;
};

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /**
     * Data-dictionary decision: product_id is NOT NULL with ON DELETE RESTRICT.
     * Products are soft-deleted (status=archived) per the dictionary's
     * "preferred soft-delete products" policy, so the reference is permanent
     * and order history can always render the original product linkage.
     */
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /* ---- Snapshots taken at order creation (PHASE-07 writes these) ---- */
    productNameSnapshot: text('product_name_snapshot').notNull(),
    variantAttributesSnapshot: jsonb(
      'variant_attributes_snapshot',
    ).$type<OrderItemAttributeSnapshot[]>().notNull(),
    skuSnapshot: text('sku_snapshot').notNull(),
    originalUnitPriceSnapshot: numeric('original_unit_price_snapshot', {
      precision: 12,
      scale: 2,
    }).notNull(),
    currentUnitPriceSnapshot: numeric('current_unit_price_snapshot', {
      precision: 12,
      scale: 2,
    }).notNull(),
    /** Unit price actually charged = live current price re-read server-side. */
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    quantity: integer('quantity').notNull(),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One line per variant per order — repeated adds merge into quantity.
    uniqueIndex('order_items_order_variant_key').on(t.orderId, t.variantId),
    uniqueIndex('order_items_id_product_key').on(t.id, t.productId),
    index('idx_order_items_order').on(t.orderId),
    index('idx_order_items_product').on(t.productId),
    index('idx_order_items_variant').on(t.variantId),

    check('order_items_quantity_positive', sql`quantity > 0`),
    check(
      'order_items_original_unit_price_positive',
      sql`original_unit_price_snapshot > 0`,
    ),
    check(
      'order_items_current_unit_price_positive',
      sql`current_unit_price_snapshot > 0`,
    ),
    check('order_items_unit_price_positive', sql`unit_price > 0`),
    check('order_items_subtotal_nonnegative', sql`subtotal >= 0`),
    foreignKey({
      name: 'order_items_variant_product_fk',
      columns: [t.variantId, t.productId],
      foreignColumns: [productVariants.id, productVariants.productId],
    }).onDelete('restrict'),
    // Exact money identity: scale-2 value × integer never loses precision.
    check('order_items_subtotal_identity', sql`subtotal = unit_price * quantity`),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
