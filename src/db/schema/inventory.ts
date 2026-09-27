/**
 * Amira Store — inventory movement ledger.
 *
 * Source: docs/DATA_DICTIONARY.md (inventory_movements) + MASTER_PLAN §13 +
 * PHASE-07/PHASE-08 (consumers).
 *
 * Business invariants encoded here:
 * - the ledger is append-only and internally consistent:
 *   stock_after = stock_before + quantity_delta, with both quantities
 *   nonnegative (no negative stock can ever be recorded or reached);
 * - "restore stock exactly once" on cancellation is DB-enforced by the partial
 *   unique index: at most ONE cancellation_return movement can ever reference
 *   a given order (documented dictionary decision);
 * - every inventory-affecting change later records exactly one row, inside the
 *   same transaction as the stock update (application contract, PHASE-07/08).
 */

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { inventoryMovementTypeEnum } from './enums';
import { productVariants } from './catalog';
import { orders } from './customers-orders';
import { adminUsers } from './admin';

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    /** Order that caused the movement (NULL for manual/opening adjustments). */
    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'restrict',
    }),
    /** Admin who performed a manual action (NULL for system flows like checkout). */
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    movementType: inventoryMovementTypeEnum('movement_type').notNull(),
    /** Signed delta applied to stock (negative = decrement). */
    quantityDelta: integer('quantity_delta').notNull(),
    stockBefore: integer('stock_before').notNull(),
    stockAfter: integer('stock_after').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Inventory ledger lookup by variant (PHASE-02 task 9) + order audit view.
    index('idx_inventory_movements_variant').on(t.variantId, t.createdAt.desc()),
    index('idx_inventory_movements_order').on(t.orderId),
    index('idx_inventory_movements_admin').on(t.adminUserId),

    // At most ONE cancellation-return per order → stock restored exactly once.
    uniqueIndex('inventory_movements_order_cancel_return_key')
      .on(t.orderId)
      .where(sql`movement_type = 'cancellation_return'`),

    check(
      'inventory_movements_delta_nonzero',
      sql`quantity_delta <> 0`,
    ),
    check('inventory_movements_stock_before_nonnegative', sql`stock_before >= 0`),
    check('inventory_movements_stock_after_nonnegative', sql`stock_after >= 0`),
    // Ledger internal consistency — before + delta = after, always.
    check(
      'inventory_movements_stock_identity',
      sql`stock_after = stock_before + quantity_delta`,
    ),
  ],
);

export type InventoryMovement = typeof inventoryMovements.$inferSelect;
