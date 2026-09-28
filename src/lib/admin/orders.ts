/**
 * Amira Store — admin order management service (PHASE-08).
 *
 * MASTER_PLAN §11/§12/§13/§18 + docs/phases/PHASE-08.md. The admin side of the
 * order domain built in PHASE-07. Every rule enforced here:
 *
 * - EXPLICIT validated transitions only (§12 "do not invent silent state
 *   transitions"): order status walks new → under_review → confirmed →
 *   preparing → completed with cancel from any active state; shipping walks
 *   not_started → preparing → ready_to_ship → shipped → out_for_delivery →
 *   delivered with delivery_failed → returned_to_stock as the sanctioned exit;
 *   payment walks pending → collected | failed (→ collected correction).
 * - Completing an order requires shipping_status = delivered (operate from
 *   creation through delivery in the honest timeline).
 * - Canceling is allowed only PRE-SHIPMENT (shipping ∈ not_started/preparing/
 *   ready_to_ship). Post-shipment failures exit through delivery_failed →
 *   returned_to_stock, which restores stock exactly once and — as an explicit,
 *   audited coupling (items physically back in stock ⇒ the order cannot
 *   stand) — cancels the order when it is not already canceled.
 * - Stock restoration is EXACTLY ONCE per (order, variant): the code checks
 *   existing cancellation_return rows first, and the partial unique index
 *   (migration 0002) is the structural backstop — a duplicate restoration is
 *   impossible even under a race.
 * - Shipping cost is entered after WhatsApp confirmation and the grand total
 *   is recalculated SERVER-SIDE (grand = products + shipping; DB CHECK
 *   `orders_grand_total_identity` is the final authority).
 * - Order editing (items/notes/address) runs in ONE transaction: the prior
 *   order state is the baseline, per-variant inventory deltas are computed
 *   against it, increases re-validate live activity + stock under
 *   deterministic `ORDER BY id FOR UPDATE` locks (no negative stock — same
 *   discipline as checkout), new lines are priced with LIVE database prices
 *   while existing lines KEEP their committed unit price (historical truth),
 *   and every stock change lands in the ledger with exact before/after.
 * - Every high-impact mutation writes an admin_activity_logs row ATOMICALLY
 *   (same transaction, sanitized metadata).
 *
 * Money discipline: all arithmetic happens in integer piasters
 * (`moneyToCents`/`centsToPriceString` — the canonical implementations);
 * numeric(12,2) strings only at the boundary.
 */

import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import {
  adminActivityLogs,
  adminUsers,
  attributeValues,
  attributes,
  categories,
  inventoryMovements,
  orderItems,
  orders,
  productVariants,
  products,
  variantAttributeValues,
} from '@/db/schema';
import type { OrderItemAttributeSnapshot } from '@/db/schema/customers-orders';
import type { InventoryMovement, Order, OrderItem } from '@/db/schema';
import { recordAdminActivity } from '@/lib/auth/activity';
import { centsToPriceString } from '@/lib/storefront/cart';
import { moneyToCents } from '@/lib/storefront/whatsapp';

/** Transaction handle type (matches db.transaction's callback argument). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type OrderStatus = Order['orderStatus'];
export type ShippingStatus = Order['shippingStatus'];
export type PaymentStatus = Order['paymentStatus'];
export type MovementType = InventoryMovement['movementType'];

/* -------------------------------------------------------------------------- */
/* Explicit transition maps (MASTER_PLAN §12 — the ONLY sanctioned edges)      */
/* -------------------------------------------------------------------------- */

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ['under_review', 'canceled'],
  under_review: ['confirmed', 'canceled'],
  confirmed: ['preparing', 'canceled'],
  preparing: ['completed', 'canceled'],
  completed: [],
  canceled: [],
};

export const SHIPPING_STATUS_TRANSITIONS: Record<ShippingStatus, ShippingStatus[]> = {
  not_started: ['preparing'],
  preparing: ['ready_to_ship'],
  ready_to_ship: ['shipped'],
  shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered', 'delivery_failed'],
  delivered: [],
  delivery_failed: ['returned_to_stock'],
  returned_to_stock: [],
};

export const PAYMENT_STATUS_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['collected', 'failed'],
  failed: ['collected'],
  collected: [],
};

/** States whose order (items/shipping cost) can still be changed. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'new',
  'under_review',
  'confirmed',
  'preparing',
];

/** Shipping states before courier hand-off (item edits + cancellation allowed). */
export const PRE_SHIPMENT_STATUSES: readonly ShippingStatus[] = [
  'not_started',
  'preparing',
  'ready_to_ship',
];

/* -------------------------------------------------------------------------- */
/* Arabic labels (single source for admin UI + audit metadata)                 */
/* -------------------------------------------------------------------------- */

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'جديد',
  under_review: 'قيد المراجعة',
  confirmed: 'مؤكد',
  preparing: 'قيد التجهيز',
  completed: 'مكتمل',
  canceled: 'ملغى',
};

export const SHIPPING_STATUS_LABELS: Record<ShippingStatus, string> = {
  not_started: 'لم تبدأ',
  preparing: 'قيد التجهيز',
  ready_to_ship: 'جاهزة للشحن',
  shipped: 'تم الشحن',
  out_for_delivery: 'قيد التوصيل',
  delivered: 'تم التسليم',
  delivery_failed: 'فشل التوصيل',
  returned_to_stock: 'أُعيدت للمخزون',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'بانتظار التحصيل',
  collected: 'تم التحصيل',
  failed: 'فشل التحصيل',
};

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  opening: 'رصيد افتتاحي',
  sale: 'بيع',
  cancellation_return: 'إرجاع إلغاء طلب',
  manual_adjustment: 'تعديل يدوي',
  order_edit_increase: 'زيادة بتعديل طلب',
  order_edit_decrease: 'نقص بتعديل طلب',
  other: 'أخرى',
};

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export class OrderServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'OrderServiceError';
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* Request schemas                                                             */
/* -------------------------------------------------------------------------- */

/** Same ceilings as checkout (50 lines × quantity ≤ 99) — one contract. */
export const ORDER_EDIT_MAX_LINES = 50;
export const ORDER_EDIT_MAX_LINE_QUANTITY = 99;

export const orderEditItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(ORDER_EDIT_MAX_LINE_QUANTITY),
});

export const orderEditSchema = z
  .object({
    /** The FULL desired line set — lines omitted from the array are removed. */
    items: z.array(orderEditItemSchema).min(1).max(ORDER_EDIT_MAX_LINES),
    notes: z.string().trim().max(500).nullish(),
    address: z.string().trim().min(5, 'العنوان قصير جدًا').max(500).optional(),
  })
  .refine(
    (value) => new Set(value.items.map((item) => item.variantId)).size === value.items.length,
    { message: 'لا يمكن تكرار نفس المتغير في الطلب.' },
  );

export type OrderEditInput = z.infer<typeof orderEditSchema>;

/** Shipping cost: 0–5000 EGP, at most 2 decimals (integer piasters exact). */
export const shippingCostSchema = z
  .number()
  .min(0, 'تكلفة الشحن غير صالحة.')
  .max(5000, 'تكلفة الشحن غير صالحة.')
  .refine((value) => Math.round(value * 100) === Number((value * 100).toFixed(6)), {
    message: 'تكلفة الشحن تقبل خانتين عشريتين كحد أقصى.',
  });

/* -------------------------------------------------------------------------- */
/* Testability hooks (verify:orders rollback proof ONLY — never HTTP routes)   */
/* -------------------------------------------------------------------------- */

export type OrderServiceTestHooks = {
  onBeforeCommit?: (tx: Tx) => Promise<void>;
};

function applyHooks(hooks: OrderServiceTestHooks | undefined, tx: Tx): Promise<void> {
  return hooks?.onBeforeCommit ? hooks.onBeforeCommit(tx) : Promise.resolve();
}

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

function assertOrderId(orderId: string): void {
  if (!UUID_PATTERN.test(orderId)) {
    throw new OrderServiceError('معرّف الطلب غير صالح.', 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Stock restoration — EXACTLY ONCE per (order, variant)                       */
/* -------------------------------------------------------------------------- */

type RestoredLine = {
  variantId: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
};

/**
 * Restore stock for every ordered variant that does not ALREADY have a
 * cancellation_return movement for this order. The partial unique index
 * `inventory_movements_order_cancel_return_key (order_id, variant_id)` is the
 * structural backstop: even a concurrent double-restore ends in a hard
 * constraint error, never a double increment.
 */
async function restoreOrderStockOnce(
  tx: Tx,
  orderId: string,
  orderNumber: string,
  adminId: string | null,
  reasonLabel: string,
): Promise<RestoredLine[]> {
  const items = await tx
    .select({ variantId: orderItems.variantId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const alreadyRestored = await tx
    .select({ variantId: inventoryMovements.variantId })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.orderId, orderId),
        eq(inventoryMovements.movementType, 'cancellation_return'),
      ),
    );
  const restored = new Set(alreadyRestored.map((row) => row.variantId));

  const lines: RestoredLine[] = [];
  // Deterministic processing order (same discipline as checkout locking).
  for (const item of [...items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    if (restored.has(item.variantId)) continue;
    const updated = await tx
      .update(productVariants)
      .set({ stockQuantity: sql`${productVariants.stockQuantity} + ${item.quantity}` })
      .where(eq(productVariants.id, item.variantId))
      .returning({ stockAfter: productVariants.stockQuantity });
    const stockAfter = updated[0]?.stockAfter;
    if (stockAfter === undefined) {
      throw new Error(`stock race detected for variant ${item.variantId}`);
    }
    const stockBefore = stockAfter - item.quantity;
    await tx.insert(inventoryMovements).values({
      variantId: item.variantId,
      orderId,
      adminUserId: adminId,
      movementType: 'cancellation_return',
      quantityDelta: item.quantity,
      stockBefore,
      stockAfter,
      reason: `${reasonLabel} — order ${orderNumber}`,
    });
    lines.push({ variantId: item.variantId, quantity: item.quantity, stockBefore, stockAfter });
  }
  return lines;
}

/* -------------------------------------------------------------------------- */
/* Category reachability (identical rule to checkout/cart)                     */
/* -------------------------------------------------------------------------- */

function buildReachability(
  rows: Array<{ id: string; parentId: string | null; isActive: boolean }>,
): (categoryId: string) => boolean {
  const activeById = new Map(rows.map((row) => [row.id, row.isActive]));
  const parentById = new Map(rows.map((row) => [row.id, row.parentId]));
  return (categoryId: string): boolean => {
    let current: string | null = categoryId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      if (activeById.get(current) !== true) return false;
      current = parentById.get(current) ?? null;
    }
    return true;
  };
}

/* -------------------------------------------------------------------------- */
/* Order status transitions                                                    */
/* -------------------------------------------------------------------------- */

export type StatusTransitionResult = {
  orderNumber: string;
  from: OrderStatus;
  to: OrderStatus;
  /** Variants whose stock was restored (cancellations only). */
  restored: RestoredLine[];
};

export async function transitionOrderStatus(
  orderId: string,
  target: OrderStatus,
  adminId: string,
  hooks: OrderServiceTestHooks = {},
): Promise<StatusTransitionResult> {
  assertOrderId(orderId);
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
      .for('update');
    const order = locked[0];
    if (!order) throw new OrderServiceError('الطلب غير موجود.', 404);

    const allowed = ORDER_STATUS_TRANSITIONS[order.orderStatus];
    if (!allowed.includes(target)) {
      throw new OrderServiceError(
        `لا يمكن الانتقال من حالة "${ORDER_STATUS_LABELS[order.orderStatus]}" إلى "${ORDER_STATUS_LABELS[target]}".`,
      );
    }
    if (target === 'completed' && order.shippingStatus !== 'delivered') {
      throw new OrderServiceError('لا يمكن إكمال الطلب قبل تسليمه للعميل.');
    }

    let restored: RestoredLine[] = [];
    if (target === 'canceled') {
      if (!PRE_SHIPMENT_STATUSES.includes(order.shippingStatus)) {
        throw new OrderServiceError(
          'لا يمكن إلغاء طلب بعد الشحن — استخدم «فشل التوصيل» ثم «إرجاع للمخزون».',
        );
      }
      restored = await restoreOrderStockOnce(
        tx,
        orderId,
        order.orderNumber,
        adminId,
        'إلغاء طلب',
      );
    }

    await tx
      .update(orders)
      .set({ orderStatus: target, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await recordAdminActivity(
      {
        adminUserId: adminId,
        action: 'order.status_changed',
        entityType: 'order',
        entityId: orderId,
        metadata: {
          orderNumber: order.orderNumber,
          from: order.orderStatus,
          to: target,
          restoredVariants: restored.length,
        },
      },
      tx,
    );

    await applyHooks(hooks, tx);
    return { orderNumber: order.orderNumber, from: order.orderStatus, to: target, restored };
  });
}

/* -------------------------------------------------------------------------- */
/* Shipping status transitions                                                 */
/* -------------------------------------------------------------------------- */

export type ShippingTransitionResult = {
  orderNumber: string;
  from: ShippingStatus;
  to: ShippingStatus;
  restored: RestoredLine[];
  /** True when returned_to_stock also canceled the order (explicit coupling). */
  coupledCancellation: boolean;
};

export async function transitionShippingStatus(
  orderId: string,
  target: ShippingStatus,
  adminId: string,
  hooks: OrderServiceTestHooks = {},
): Promise<ShippingTransitionResult> {
  assertOrderId(orderId);
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
      .for('update');
    const order = locked[0];
    if (!order) throw new OrderServiceError('الطلب غير موجود.', 404);

    const wasCanceled = order.orderStatus === 'canceled';
    if (wasCanceled) {
      throw new OrderServiceError('لا يمكن تحديث حالة الشحن لطلب ملغى.');
    }
    const allowed = SHIPPING_STATUS_TRANSITIONS[order.shippingStatus];
    if (!allowed.includes(target)) {
      throw new OrderServiceError(
        `لا يمكن الانتقال من حالة الشحن "${SHIPPING_STATUS_LABELS[order.shippingStatus]}" إلى "${SHIPPING_STATUS_LABELS[target]}".`,
      );
    }

    let restored: RestoredLine[] = [];
    let coupledCancellation = false;
    if (target === 'returned_to_stock') {
      // Explicit, audited coupling: items physically back in stock ⇒ the sale
      // cannot stand. Stock is restored exactly once; the order is canceled
      // here if it is not already (this is the only exit after shipment).
      restored = await restoreOrderStockOnce(
        tx,
        orderId,
        order.orderNumber,
        adminId,
        'إرجاع للمخزون',
      );
      if (!wasCanceled) {
        await tx
          .update(orders)
          .set({ orderStatus: 'canceled', updatedAt: new Date() })
          .where(eq(orders.id, orderId));
        coupledCancellation = true;
      }
    }

    await tx
      .update(orders)
      .set({ shippingStatus: target, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await recordAdminActivity(
      {
        adminUserId: adminId,
        action: 'order.shipping_status_changed',
        entityType: 'order',
        entityId: orderId,
        metadata: {
          orderNumber: order.orderNumber,
          from: order.shippingStatus,
          to: target,
          restoredVariants: restored.length,
          coupledCancellation,
        },
      },
      tx,
    );

    await applyHooks(hooks, tx);
    return {
      orderNumber: order.orderNumber,
      from: order.shippingStatus,
      to: target,
      restored,
      coupledCancellation,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Shipping cost entry (§11 — after WhatsApp confirmation)                     */
/* -------------------------------------------------------------------------- */

export async function setShippingCost(
  orderId: string,
  costEgp: number,
  adminId: string,
  hooks: OrderServiceTestHooks = {},
): Promise<{ orderNumber: string; shippingCost: string; grandTotal: string }> {
  assertOrderId(orderId);
  const parsed = shippingCostSchema.parse(costEgp);
  const cents = Math.round(parsed * 100);
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
      .for('update');
    const order = locked[0];
    if (!order) throw new OrderServiceError('الطلب غير موجود.', 404);
    if (!ACTIVE_ORDER_STATUSES.includes(order.orderStatus)) {
      throw new OrderServiceError('لا يمكن تعديل تكلفة الشحن لطلب مكتمل أو ملغى.');
    }

    // SERVER-SIDE recalculation (PHASE-08 task 5; MASTER_PLAN §11). The DB
    // CHECK orders_grand_total_identity re-validates the identity at write time.
    const productsCents = moneyToCents(order.productsTotal);
    const shippingCost = centsToPriceString(cents);
    const grandTotal = centsToPriceString(productsCents + cents);

    await tx
      .update(orders)
      .set({ shippingCost, grandTotal, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await recordAdminActivity(
      {
        adminUserId: adminId,
        action: 'order.shipping_cost_set',
        entityType: 'order',
        entityId: orderId,
        metadata: {
          orderNumber: order.orderNumber,
          previousShippingCost: order.shippingCost,
          shippingCost,
          grandTotal,
        },
      },
      tx,
    );

    await applyHooks(hooks, tx);
    return { orderNumber: order.orderNumber, shippingCost, grandTotal };
  });
}

/* -------------------------------------------------------------------------- */
/* Payment status (COD collection tracking)                                    */
/* -------------------------------------------------------------------------- */

export async function setPaymentStatus(
  orderId: string,
  target: PaymentStatus,
  adminId: string,
  hooks: OrderServiceTestHooks = {},
): Promise<{ orderNumber: string; from: PaymentStatus; to: PaymentStatus }> {
  assertOrderId(orderId);
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
      .for('update');
    const order = locked[0];
    if (!order) throw new OrderServiceError('الطلب غير موجود.', 404);
    if (order.orderStatus === 'canceled') {
      throw new OrderServiceError('لا يمكن تعديل حالة التحصيل لطلب ملغى.');
    }
    if (!PAYMENT_STATUS_TRANSITIONS[order.paymentStatus].includes(target)) {
      throw new OrderServiceError(
        `لا يمكن الانتقال من حالة التحصيل "${PAYMENT_STATUS_LABELS[order.paymentStatus]}" إلى "${PAYMENT_STATUS_LABELS[target]}".`,
      );
    }

    await tx
      .update(orders)
      .set({ paymentStatus: target, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await recordAdminActivity(
      {
        adminUserId: adminId,
        action: 'order.payment_status_changed',
        entityType: 'order',
        entityId: orderId,
        metadata: {
          orderNumber: order.orderNumber,
          from: order.paymentStatus,
          to: target,
        },
      },
      tx,
    );

    await applyHooks(hooks, tx);
    return { orderNumber: order.orderNumber, from: order.paymentStatus, to: target };
  });
}

/* -------------------------------------------------------------------------- */
/* Order editing (items/notes/address) — atomic, delta-based, no negative stock */
/* -------------------------------------------------------------------------- */

type EditVariantRow = {
  variantId: string;
  variantActive: boolean;
  stockQuantity: number;
  sku: string;
  originalPrice: string;
  currentPrice: string;
  productId: string;
  productName: string;
  productStatus: 'draft' | 'active' | 'archived';
  categoryId: string;
};

export type StockChangeSummary = {
  variantId: string;
  delta: number;
  stockBefore: number;
  stockAfter: number;
};

export type OrderEditSummary = {
  orderNumber: string;
  previousProductsTotal: string;
  productsTotal: string;
  grandTotal: string;
  addedLines: number;
  removedLines: number;
  increased: StockChangeSummary[];
  decreased: StockChangeSummary[];
};

export async function updateOrderItems(
  orderId: string,
  input: OrderEditInput,
  adminId: string,
  hooks: OrderServiceTestHooks = {},
): Promise<OrderEditSummary> {
  assertOrderId(orderId);
  return db.transaction(async (tx) => {
    /* --- 1. Lock the order; verify it is still editable -------------------- */
    const locked = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
      .for('update');
    const order = locked[0];
    if (!order) throw new OrderServiceError('الطلب غير موجود.', 404);
    if (
      !ACTIVE_ORDER_STATUSES.includes(order.orderStatus) ||
      !PRE_SHIPMENT_STATUSES.includes(order.shippingStatus)
    ) {
      throw new OrderServiceError(
        'لا يمكن تعديل بنود الطلب في حالته الحالية (بعد الشحن أو الإلغاء أو الإكمال).',
      );
    }

    /* --- 2. Prior committed state = the delta baseline --------------------- */
    const prior = await tx
      .select({
        id: orderItems.id,
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    const priorByVariant = new Map(prior.map((line) => [line.variantId, line]));

    /* --- 3. Classify per-variant deltas against the prior state ------------ */
    const increases: Array<{ variantId: string; delta: number }> = [];
    const decreases: Array<{ variantId: string; delta: number }> = [];
    const removals: Array<{ variantId: string }> = [];
    for (const item of input.items) {
      const old = priorByVariant.get(item.variantId);
      if (!old) {
        increases.push({ variantId: item.variantId, delta: item.quantity });
      } else if (item.quantity > old.quantity) {
        increases.push({ variantId: item.variantId, delta: item.quantity - old.quantity });
      } else if (item.quantity < old.quantity) {
        decreases.push({ variantId: item.variantId, delta: old.quantity - item.quantity });
      }
    }
    for (const line of prior) {
      if (!input.items.some((item) => item.variantId === line.variantId)) {
        removals.push({ variantId: line.variantId });
        decreases.push({ variantId: line.variantId, delta: line.quantity });
      }
    }

    /* --- 4. Lock affected variants deterministically (deadlock-safe) ------- */
    const affectedIds = [
      ...new Set([...increases, ...decreases].map((entry) => entry.variantId)),
    ].sort();
    const variantRows =
      affectedIds.length > 0
        ? await tx
            .select({
              variantId: productVariants.id,
              variantActive: productVariants.isActive,
              stockQuantity: productVariants.stockQuantity,
              sku: productVariants.sku,
              originalPrice: productVariants.originalPrice,
              currentPrice: productVariants.currentPrice,
              productId: products.id,
              productName: products.name,
              productStatus: products.status,
              categoryId: products.categoryId,
            })
            .from(productVariants)
            .innerJoin(products, eq(productVariants.productId, products.id))
            .where(inArray(productVariants.id, affectedIds))
            .orderBy(productVariants.id)
            .for('update')
        : [];
    const rowByVariant = new Map<string, EditVariantRow>(
      variantRows.map((row) => [row.variantId, row]),
    );

    /* --- 5. Validate: increases need live activity + stock (no negative) --- */
    const categoryRows = await tx
      .select({ id: categories.id, parentId: categories.parentId, isActive: categories.isActive })
      .from(categories);
    const isReachable = buildReachability(categoryRows);

    for (const increase of increases) {
      const row = rowByVariant.get(increase.variantId);
      if (!row) {
        throw new OrderServiceError('أحد المتغيرات المطلوبة غير موجود.', 404);
      }
      if (!row.variantActive || row.productStatus !== 'active' || !isReachable(row.categoryId)) {
        throw new OrderServiceError(
          `المنتج «${row.productName}» (${row.sku}) لم يعد متاحًا للبيع — لا يمكن زيادة كميته.`,
        );
      }
      if (row.stockQuantity < increase.delta) {
        throw new OrderServiceError(
          `المخزون غير كافٍ للمنتج «${row.productName}» (${row.sku}) — المتاح: ${row.stockQuantity}.`,
        );
      }
    }

    /* --- 6. Apply stock changes + one ledger row per touched variant ------- */
    const appliedDecreases: StockChangeSummary[] = [];
    const appliedIncreases: StockChangeSummary[] = [];

    for (const decrease of decreases) {
      const row = rowByVariant.get(decrease.variantId);
      if (!row) throw new Error(`missing locked variant row ${decrease.variantId}`);
      // Returns can never create negative stock; unconditional + returning.
      const updated = await tx
        .update(productVariants)
        .set({ stockQuantity: sql`${productVariants.stockQuantity} + ${decrease.delta}` })
        .where(eq(productVariants.id, decrease.variantId))
        .returning({ stockAfter: productVariants.stockQuantity });
      const stockAfter = updated[0]!.stockAfter;
      const stockBefore = stockAfter - decrease.delta;
      await tx.insert(inventoryMovements).values({
        variantId: decrease.variantId,
        orderId,
        adminUserId: adminId,
        movementType: 'order_edit_decrease',
        quantityDelta: decrease.delta,
        stockBefore,
        stockAfter,
        reason: `تعديل طلب — order ${order.orderNumber}`,
      });
      appliedDecreases.push({
        variantId: decrease.variantId,
        delta: decrease.delta,
        stockBefore,
        stockAfter,
      });
    }
    for (const increase of increases) {
      const row = rowByVariant.get(increase.variantId);
      if (!row) throw new Error(`missing locked variant row ${increase.variantId}`);
      // Conditional update under the lock — belt-and-braces against negative stock.
      const updated = await tx
        .update(productVariants)
        .set({ stockQuantity: sql`${productVariants.stockQuantity} - ${increase.delta}` })
        .where(
          sql`${productVariants.id} = ${increase.variantId} AND ${productVariants.stockQuantity} >= ${increase.delta}`,
        )
        .returning({ stockAfter: productVariants.stockQuantity });
      const stockAfter = updated[0]?.stockAfter;
      if (stockAfter === undefined) {
        throw new Error(`stock race detected for variant ${increase.variantId}`);
      }
      const stockBefore = stockAfter + increase.delta;
      await tx.insert(inventoryMovements).values({
        variantId: increase.variantId,
        orderId,
        adminUserId: adminId,
        movementType: 'order_edit_increase',
        quantityDelta: -increase.delta,
        stockBefore,
        stockAfter,
        reason: `تعديل طلب — order ${order.orderNumber}`,
      });
      appliedIncreases.push({
        variantId: increase.variantId,
        delta: increase.delta,
        stockBefore,
        stockAfter,
      });
    }

    /* --- 7. Rewrite order items (keep committed unit prices; live for NEW) - */
    // Attribute snapshots for NEW lines (grouped single query, checkout-style).
    const newVariantIds = input.items
      .filter((item) => !priorByVariant.has(item.variantId))
      .map((item) => item.variantId);
    const attributeRows =
      newVariantIds.length > 0
        ? await tx
            .select({
              variantId: variantAttributeValues.variantId,
              attributeName: attributes.name,
              value: attributeValues.value,
              valueSlug: attributeValues.slug,
            })
            .from(variantAttributeValues)
            .innerJoin(
              attributeValues,
              eq(variantAttributeValues.attributeValueId, attributeValues.id),
            )
            .innerJoin(attributes, eq(attributeValues.attributeId, attributes.id))
            .where(inArray(variantAttributeValues.variantId, newVariantIds))
        : [];
    const attributesByVariant = new Map<string, OrderItemAttributeSnapshot[]>();
    for (const row of attributeRows) {
      const list = attributesByVariant.get(row.variantId) ?? [];
      list.push({ attribute: row.attributeName, value: row.value, valueSlug: row.valueSlug });
      attributesByVariant.set(row.variantId, list);
    }

    let productsTotalCents = 0;
    let addedLines = 0;

    for (const item of input.items) {
      const old = priorByVariant.get(item.variantId);
      if (old) {
        // Existing line: the committed unit price NEVER changes (historical
        // truth); only quantity + subtotal change (subtotal = price × qty).
        const unitCents = moneyToCents(old.unitPrice);
        productsTotalCents += unitCents * item.quantity;
        if (item.quantity !== old.quantity) {
          await tx
            .update(orderItems)
            .set({
              quantity: item.quantity,
              subtotal: centsToPriceString(unitCents * item.quantity),
            })
            .where(eq(orderItems.id, old.id));
        }
      } else {
        // NEW line: full snapshots from LIVE database values (checkout rules).
        const row = rowByVariant.get(item.variantId);
        if (!row) throw new OrderServiceError('أحد المتغيرات المطلوبة غير موجود.', 404);
        const unitCents = moneyToCents(row.currentPrice);
        productsTotalCents += unitCents * item.quantity;
        await tx.insert(orderItems).values({
          orderId,
          productId: row.productId,
          variantId: row.variantId,
          productNameSnapshot: row.productName,
          variantAttributesSnapshot: attributesByVariant.get(row.variantId) ?? [],
          skuSnapshot: row.sku,
          originalUnitPriceSnapshot: row.originalPrice,
          currentUnitPriceSnapshot: row.currentPrice,
          unitPrice: row.currentPrice,
          quantity: item.quantity,
          subtotal: centsToPriceString(unitCents * item.quantity),
        });
        addedLines += 1;
      }
    }

    let removedLines = 0;
    for (const removal of removals) {
      await tx.delete(orderItems).where(
        and(eq(orderItems.orderId, orderId), eq(orderItems.variantId, removal.variantId)),
      );
      removedLines += 1;
    }

    /* --- 8. Totals + notes/address (grand identity re-checked by the DB) --- */
    const productsTotal = centsToPriceString(productsTotalCents);
    const grandTotal = centsToPriceString(
      productsTotalCents + (order.shippingCost ? moneyToCents(order.shippingCost) : 0),
    );
    const orderUpdate: Partial<typeof orders.$inferInsert> = {
      productsTotal,
      grandTotal,
      updatedAt: new Date(),
    };
    if (input.notes !== undefined) orderUpdate.notes = input.notes === '' ? null : input.notes;
    if (input.address !== undefined) orderUpdate.addressSnapshot = input.address;
    await tx.update(orders).set(orderUpdate).where(eq(orders.id, orderId));

    await recordAdminActivity(
      {
        adminUserId: adminId,
        action: 'order.items_updated',
        entityType: 'order',
        entityId: orderId,
        metadata: {
          orderNumber: order.orderNumber,
          previousProductsTotal: order.productsTotal,
          productsTotal,
          grandTotal,
          addedLines,
          removedLines,
          increases: appliedIncreases.map((entry) => ({
            variantId: entry.variantId,
            delta: entry.delta,
          })),
          decreases: appliedDecreases.map((entry) => ({
            variantId: entry.variantId,
            delta: entry.delta,
          })),
          addressChanged: input.address !== undefined,
          notesChanged: input.notes !== undefined,
        },
      },
      tx,
    );

    await applyHooks(hooks, tx);

    return {
      orderNumber: order.orderNumber,
      previousProductsTotal: order.productsTotal,
      productsTotal,
      grandTotal,
      addedLines,
      removedLines,
      increased: appliedIncreases,
      decreased: appliedDecreases,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Queries: order list / detail / variant search / inventory views             */
/* -------------------------------------------------------------------------- */

export type OrderListFilters = {
  status?: OrderStatus | 'all';
  shippingStatus?: ShippingStatus | 'all';
  paymentStatus?: PaymentStatus | 'all';
  search?: string | null;
  limit?: number;
};

export type OrderListRow = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  orderStatus: OrderStatus;
  shippingStatus: ShippingStatus;
  paymentStatus: PaymentStatus;
  productsTotal: string;
  shippingCost: string | null;
  grandTotal: string;
  itemCount: number;
  createdAt: Date;
};

export async function listOrders(filters: OrderListFilters = {}): Promise<{
  items: OrderListRow[];
  total: number;
}> {
  const conditions: SQL<unknown>[] = [];
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(orders.orderStatus, filters.status));
  }
  if (filters.shippingStatus && filters.shippingStatus !== 'all') {
    conditions.push(eq(orders.shippingStatus, filters.shippingStatus));
  }
  if (filters.paymentStatus && filters.paymentStatus !== 'all') {
    conditions.push(eq(orders.paymentStatus, filters.paymentStatus));
  }
  const search = filters.search?.trim().slice(0, 100);
  if (search) {
    const pattern = `%${search.replace(/[%_]/g, (match) => `\\${match}`)}%`;
    conditions.push(
      or(
        ilike(orders.orderNumber, pattern),
        ilike(orders.customerNameSnapshot, pattern),
        ilike(orders.customerPhoneSnapshot, pattern),
      )!,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);

  const items = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerNameSnapshot,
      customerPhone: orders.customerPhoneSnapshot,
      orderStatus: orders.orderStatus,
      shippingStatus: orders.shippingStatus,
      paymentStatus: orders.paymentStatus,
      productsTotal: orders.productsTotal,
      shippingCost: orders.shippingCost,
      grandTotal: orders.grandTotal,
      itemCount: sql<number>`(select count(*) from "order_items" "oi" where "oi"."order_id" = "orders"."id")::int`,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(limit);

  const totalRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);

  return { items, total: Number(totalRows[0]?.n ?? 0) };
}

export type OrderDetail = {
  order: Order;
  items: OrderItem[];
  movements: Array<{
    id: string;
    variantId: string;
    sku: string | null;
    productName: string | null;
    movementType: MovementType;
    quantityDelta: number;
    stockBefore: number;
    stockAfter: number;
    reason: string | null;
    adminUsername: string | null;
    createdAt: Date;
  }>;
  activity: Array<{
    id: string;
    action: string;
    metadata: Record<string, unknown> | null;
    adminUsername: string | null;
    createdAt: Date;
  }>;
};

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  if (!UUID_PATTERN.test(orderId)) return null;
  const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = orderRows[0];
  if (!order) return null;

  const [items, movements, activity] = await Promise.all([
    db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(orderItems.createdAt),
    db
      .select({
        id: inventoryMovements.id,
        variantId: inventoryMovements.variantId,
        sku: productVariants.sku,
        productName: products.name,
        movementType: inventoryMovements.movementType,
        quantityDelta: inventoryMovements.quantityDelta,
        stockBefore: inventoryMovements.stockBefore,
        stockAfter: inventoryMovements.stockAfter,
        reason: inventoryMovements.reason,
        adminUsername: adminUsers.username,
        createdAt: inventoryMovements.createdAt,
      })
      .from(inventoryMovements)
      .innerJoin(productVariants, eq(inventoryMovements.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(adminUsers, eq(inventoryMovements.adminUserId, adminUsers.id))
      .where(eq(inventoryMovements.orderId, orderId))
      .orderBy(desc(inventoryMovements.createdAt)),
    db
      .select({
        id: adminActivityLogs.id,
        action: adminActivityLogs.action,
        metadata: adminActivityLogs.metadata,
        adminUsername: adminUsers.username,
        createdAt: adminActivityLogs.createdAt,
      })
      .from(adminActivityLogs)
      .leftJoin(adminUsers, eq(adminActivityLogs.adminUserId, adminUsers.id))
      .where(
        and(eq(adminActivityLogs.entityType, 'order'), eq(adminActivityLogs.entityId, orderId)),
      )
      .orderBy(desc(adminActivityLogs.createdAt))
      .limit(50),
  ]);

  return { order, items, movements, activity: activity.map((row) => ({
    ...row,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
  })) };
}

export type VariantSearchRow = {
  variantId: string;
  sku: string;
  productName: string;
  currentPrice: string;
  stockQuantity: number;
  isActive: boolean;
  productStatus: 'draft' | 'active' | 'archived';
  attributesLabel: string;
};

/** Variant picker for the order editor (results re-validated server-side on save). */
export async function searchVariantsForOrder(query: string): Promise<VariantSearchRow[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const pattern = `%${q.replace(/[%_]/g, (match) => `\\${match}`)}%`;
  return db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productName: products.name,
      currentPrice: productVariants.currentPrice,
      stockQuantity: productVariants.stockQuantity,
      isActive: productVariants.isActive,
      productStatus: products.status,
      attributesLabel: sql<string>`coalesce((
        select string_agg(av.value, ' · ' order by av.value)
        from "variant_attribute_values" "vav"
        join "attribute_values" "av" on "av"."id" = "vav"."attribute_value_id"
        where "vav"."variant_id" = ${productVariants.id}
      ), '')`,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        or(ilike(productVariants.sku, pattern), ilike(products.name, pattern))!,
        eq(products.status, 'active'),
      ),
    )
    .orderBy(products.name)
    .limit(10);
}

/* -------------------------------------------------------------------------- */
/* Inventory ledger views (PHASE-08 tasks 14–15)                               */
/* -------------------------------------------------------------------------- */

export type InventoryView = 'all' | 'low' | 'out';

export type InventoryVariantRow = {
  variantId: string;
  sku: string;
  productName: string;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
  productStatus: 'draft' | 'active' | 'archived';
};

export async function listInventoryVariants(options: {
  view?: InventoryView;
  search?: string | null;
  limit?: number;
}): Promise<{ items: InventoryVariantRow[]; total: number }> {
  const view = options.view ?? 'all';
  const conditions: SQL<unknown>[] = [];
  if (view === 'low') {
    conditions.push(
      and(
        sql`${productVariants.stockQuantity} > 0`,
        sql`${productVariants.stockQuantity} <= ${productVariants.lowStockThreshold}`,
      )!,
    );
  } else if (view === 'out') {
    conditions.push(eq(productVariants.stockQuantity, 0));
  }
  const search = options.search?.trim().slice(0, 100);
  if (search) {
    const pattern = `%${search.replace(/[%_]/g, (match) => `\\${match}`)}%`;
    conditions.push(or(ilike(productVariants.sku, pattern), ilike(products.name, pattern))!);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);

  const items = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productName: products.name,
      stockQuantity: productVariants.stockQuantity,
      lowStockThreshold: productVariants.lowStockThreshold,
      isActive: productVariants.isActive,
      productStatus: products.status,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(where)
    .orderBy(productVariants.stockQuantity, products.name)
    .limit(limit);

  const totalRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(where);

  return { items, total: Number(totalRows[0]?.n ?? 0) };
}

export type VariantLedgerEntry = {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  movementType: MovementType;
  quantityDelta: number;
  stockBefore: number;
  stockAfter: number;
  reason: string | null;
  adminUsername: string | null;
  createdAt: Date;
};

export async function getVariantLedger(variantId: string): Promise<{
  variant: InventoryVariantRow;
  movements: VariantLedgerEntry[];
} | null> {
  if (!UUID_PATTERN.test(variantId)) return null;
  const variantRows = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productName: products.name,
      stockQuantity: productVariants.stockQuantity,
      lowStockThreshold: productVariants.lowStockThreshold,
      isActive: productVariants.isActive,
      productStatus: products.status,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(productVariants.id, variantId))
    .limit(1);
  const variant = variantRows[0];
  if (!variant) return null;

  const movements = await db
    .select({
      id: inventoryMovements.id,
      orderId: inventoryMovements.orderId,
      orderNumber: orders.orderNumber,
      movementType: inventoryMovements.movementType,
      quantityDelta: inventoryMovements.quantityDelta,
      stockBefore: inventoryMovements.stockBefore,
      stockAfter: inventoryMovements.stockAfter,
      reason: inventoryMovements.reason,
      adminUsername: adminUsers.username,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .leftJoin(orders, eq(inventoryMovements.orderId, orders.id))
    .leftJoin(adminUsers, eq(inventoryMovements.adminUserId, adminUsers.id))
    .where(eq(inventoryMovements.variantId, variantId))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(200);

  return { variant, movements };
}
