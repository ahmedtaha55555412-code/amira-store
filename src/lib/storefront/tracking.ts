/**
 * Amira Store — customer order tracking (PHASE-13).
 *
 * MASTER_PLAN §14 contract, implemented on the smallest justified surface:
 *   • lookup = order number + the phone used at checkout (no account);
 *   • rate limited (per-instance sliding window keyed by HASHED client IP);
 *   • no existence oracle — unknown number / wrong phone / empty order all
 *     raise the IDENTICAL generic error (same discipline as the PHASE-09
 *     review lookup, which this service mirrors);
 *   • timeline is DERIVED from the current order/shipping states (§14's exact
 *     wording) against the canonical §12 chains — there is no status-history
 *     table, and admin audit rows are never exposed publicly;
 *   • leak-minimal payload: snapshots the customer already knows (name,
 *     items, totals, statuses) — NO internal UUIDs, NO address, NO phone echo.
 *
 * Arabic-only storefront (MASTER_PLAN §2). Pure display constants live here
 * (client-safe) instead of importing src/lib/admin/orders (which pulls the
 * DB/auth modules into the storefront surface).
 */

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { customers, orderItems, orders } from '@/db/schema';

import { normalizeEgyptianPhone } from './whatsapp';

export class TrackingServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'TrackingServiceError';
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* Request schema + rate limit                                                 */
/* -------------------------------------------------------------------------- */

/** Same accept-side shape as the review flow (case-insensitive, uppercase). */
export const trackingOrderNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^AMR-[A-Z0-9]{6}$/, 'رقم الطلب غير صحيح — مثال: AMR-4KP7QX.');

export const trackingLookupSchema = z.object({
  orderNumber: trackingOrderNumberSchema,
  phone: z
    .string()
    .trim()
    .min(8, 'برجاء كتابة رقم موبايل مصري صحيح (مثال: 01012345678).')
    .max(25, 'برجاء كتابة رقم موبايل مصري صحيح (مثال: 01012345678).')
    .refine((value) => normalizeEgyptianPhone(value) !== null, {
      message: 'برجاء كتابة رقم موبايل مصري صحيح (مثال: 01012345678).',
    }),
});

export type TrackingLookupInput = z.infer<typeof trackingLookupSchema>;

const TRACKING_WINDOW_MS = 5 * 60_000;
const TRACKING_MAX_ATTEMPTS = 12;
const TRACKING_MAX_BUCKETS = 5000;

const trackingBuckets = new Map<string, number[]>();

/**
 * Sliding-window limiter (same shape as checkout/reviews limiters).
 * Lookup is read-only but order numbers are enumerable — a hostile client
 * must not be able to brute-force (number, phone) pairs cheaply.
 */
export function trackingLookupRateLimit(key: string, now = Date.now()): boolean {
  if (trackingBuckets.size >= TRACKING_MAX_BUCKETS) {
    const oldest = now - TRACKING_WINDOW_MS;
    for (const [bucketKey, stamps] of trackingBuckets) {
      const alive = stamps.filter((t) => t > oldest);
      if (alive.length === 0) trackingBuckets.delete(bucketKey);
      else trackingBuckets.set(bucketKey, alive);
    }
    if (trackingBuckets.size >= TRACKING_MAX_BUCKETS) return false;
  }
  const windowStart = now - TRACKING_WINDOW_MS;
  const stamps = (trackingBuckets.get(key) ?? []).filter((t) => t > windowStart);
  if (stamps.length >= TRACKING_MAX_ATTEMPTS) {
    trackingBuckets.set(key, stamps);
    return false;
  }
  stamps.push(now);
  trackingBuckets.set(key, stamps);
  return true;
}

/* -------------------------------------------------------------------------- */
/* Timeline derivation (MASTER_PLAN §12 chains + §14 "current states")         */
/* -------------------------------------------------------------------------- */

export type OrderStatusKey =
  | 'new'
  | 'under_review'
  | 'confirmed'
  | 'preparing'
  | 'completed'
  | 'canceled';
export type ShippingStatusKey =
  | 'not_started'
  | 'preparing'
  | 'ready_to_ship'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'delivery_failed'
  | 'returned_to_stock';
export type PaymentStatusKey = 'pending' | 'collected' | 'failed';

export const TRACKING_ORDER_STATUS_LABELS: Record<OrderStatusKey, string> = {
  new: 'جديد',
  under_review: 'قيد المراجعة',
  confirmed: 'مؤكد',
  preparing: 'قيد التجهيز',
  completed: 'مكتمل',
  canceled: 'ملغى',
};

export const TRACKING_SHIPPING_STATUS_LABELS: Record<ShippingStatusKey, string> = {
  not_started: 'لم تبدأ',
  preparing: 'قيد التجهيز',
  ready_to_ship: 'جاهزة للشحن',
  shipped: 'تم الشحن',
  out_for_delivery: 'قيد التوصيل',
  delivered: 'تم التسليم',
  delivery_failed: 'فشل التوصيل',
  returned_to_stock: 'أُعيدت للمخزون',
};

export const TRACKING_PAYMENT_STATUS_LABELS: Record<PaymentStatusKey, string> = {
  pending: 'بانتظار التحصيل',
  collected: 'تم التحصيل',
  failed: 'فشل التحصيل',
};

/** Canonical §12 order chain (terminal `canceled` handled as a banner). */
const ORDER_TIMELINE_STEPS: readonly OrderStatusKey[] = [
  'new',
  'under_review',
  'confirmed',
  'preparing',
  'completed',
];

/** Canonical §12 shipping chain (failure/return handled as a banner). */
const SHIPPING_TIMELINE_STEPS: readonly ShippingStatusKey[] = [
  'not_started',
  'preparing',
  'ready_to_ship',
  'shipped',
  'out_for_delivery',
  'delivered',
];

export type TrackingStep = {
  key: string;
  label: string;
  /** The step has been reached. */
  done: boolean;
  /** The step is where the order currently stands. */
  current: boolean;
};

function deriveSteps<T extends string>(
  chain: readonly T[],
  current: T,
  labels: Record<T, string>,
): TrackingStep[] {
  const currentIndex = chain.indexOf(current);
  return chain.map((key, index) => ({
    key,
    label: labels[key],
    done: currentIndex >= 0 && index < currentIndex,
    current: key === current,
  }));
}

/* -------------------------------------------------------------------------- */
/* Lookup — two-step match + single generic error (no oracle)                   */
/* -------------------------------------------------------------------------- */

/** Generic failure for EVERY match miss — identical for all causes. */
export const TRACKING_MATCH_ERROR =
  'لم نتمكن من التحقق من الطلب. تأكد من رقم الطلب ورقم الموبايل المستخدم في الشراء.';

export type TrackingOrderItem = {
  productName: string;
  attributesLabel: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
};

export type TrackingOrderView = {
  orderNumber: string;
  customerName: string;
  orderStatus: { status: OrderStatusKey; label: string };
  shippingStatus: { status: ShippingStatusKey; label: string };
  paymentStatus: { status: PaymentStatusKey; label: string };
  productsTotal: string;
  shippingCost: string | null;
  grandTotal: string;
  createdAt: string;
  updatedAt: string;
  items: TrackingOrderItem[];
  timeline: { order: TrackingStep[]; shipping: TrackingStep[] };
};

export async function lookupOrderForTracking(
  input: TrackingLookupInput,
): Promise<TrackingOrderView> {
  const phone = normalizeEgyptianPhone(input.phone);
  if (!phone) throw new TrackingServiceError(TRACKING_MATCH_ERROR);

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderStatus: orders.orderStatus,
      shippingStatus: orders.shippingStatus,
      paymentStatus: orders.paymentStatus,
      productsTotal: orders.productsTotal,
      shippingCost: orders.shippingCost,
      grandTotal: orders.grandTotal,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(eq(orders.orderNumber, input.orderNumber))
    .limit(1);

  if (!order) throw new TrackingServiceError(TRACKING_MATCH_ERROR);

  // Phone authority is customers.phone_normalized (canonical +20 form) —
  // the order snapshot keeps what was TYPED, this is what was VERIFIED.
  const [customer] = await db
    .select({ name: customers.name, phoneNormalized: customers.phoneNormalized })
    .from(customers)
    .where(eq(customers.id, order.customerId))
    .limit(1);
  if (!customer || customer.phoneNormalized !== phone) {
    throw new TrackingServiceError(TRACKING_MATCH_ERROR);
  }

  const items = await db
    .select({
      productName: orderItems.productNameSnapshot,
      attributesSnapshot: orderItems.variantAttributesSnapshot,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      subtotal: orderItems.subtotal,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  if (items.length === 0) throw new TrackingServiceError(TRACKING_MATCH_ERROR);

  const orderStatus = order.orderStatus as OrderStatusKey;
  const shippingStatus = order.shippingStatus as ShippingStatusKey;
  const paymentStatus = order.paymentStatus as PaymentStatusKey;

  return {
    orderNumber: order.orderNumber,
    customerName: customer.name,
    orderStatus: {
      status: orderStatus,
      label: TRACKING_ORDER_STATUS_LABELS[orderStatus] ?? orderStatus,
    },
    shippingStatus: {
      status: shippingStatus,
      label: TRACKING_SHIPPING_STATUS_LABELS[shippingStatus] ?? shippingStatus,
    },
    paymentStatus: {
      status: paymentStatus,
      label: TRACKING_PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus,
    },
    productsTotal: order.productsTotal,
    shippingCost: order.shippingCost,
    grandTotal: order.grandTotal,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: items.map((item) => {
      const snapshot = item.attributesSnapshot;
      const parts = Array.isArray(snapshot)
        ? snapshot
            .map((entry) =>
              entry && typeof entry === 'object' && 'value' in entry
                ? String((entry as { value: unknown }).value)
                : null,
            )
            .filter((value): value is string => Boolean(value))
        : [];
      return {
        productName: item.productName,
        attributesLabel: parts.length > 0 ? parts.join(' · ') : null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      };
    }),
    timeline: {
      order: deriveSteps(ORDER_TIMELINE_STEPS, orderStatus, TRACKING_ORDER_STATUS_LABELS),
      shipping: deriveSteps(
        SHIPPING_TIMELINE_STEPS,
        shippingStatus,
        TRACKING_SHIPPING_STATUS_LABELS,
      ),
    },
  };
}
