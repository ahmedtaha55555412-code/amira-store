/**
 * Amira Store — checkout + order creation service (PHASE-07).
 *
 * MASTER_PLAN §9/§10/§11/§13 + docs/phases/PHASE-07.md. Order creation is the
 * authoritative business action: ONE PostgreSQL transaction that
 *
 *   1. re-reads EVERY cart variant from the database (never trusts the client);
 *   2. verifies variant/product activity and category reachability;
 *   3. verifies stock under a deterministic row lock (`ORDER BY id FOR UPDATE`
 *      — two concurrent checkouts competing for the same stock cannot oversell;
 *      the conditional UPDATE re-checks `stock_quantity >= qty` belt-and-braces);
 *   4. prices every line with the LIVE database price (client prices are
 *      absent from the schema entirely — there is nothing to trust);
 *   5. resolves/creates the customer by normalized phone (unique upsert);
 *   6. creates the order with customer/address/WhatsApp snapshots;
 *   7. creates order items with product/variant/price/attribute snapshots
 *      (one line per variant per order — duplicate variant ids merge);
 *   8. decrements stock immediately;
 *   9. records `sale` inventory movements with exact before/after quantities;
 *  10. commits everything atomically — any failure leaves zero partial state;
 *  11. generates the customer-facing order number;
 *  12. builds the WhatsApp pre-filled message STRICTLY from committed data.
 *
 * Idempotency (MASTER_PLAN §10 "duplicate submit = same idempotent result"):
 * `orders.idempotency_key` carries a partial UNIQUE index. The first writer
 * wins; a losing concurrent insert raises 23505 on
 * `orders_idempotency_key_unique`, the transaction rolls back harmlessly, and
 * the service rebuilds the SAME customer-facing result from the committed
 * order rows — a duplicate submission can never create a second order.
 *
 * WhatsApp failure is non-transactional by design: the message/URL are built
 * AFTER commit from committed rows only; if opening fails, the order remains
 * valid and the success page exposes copy/open fallbacks.
 *
 * Money discipline: numeric(12,2) strings are converted to integer piasters
 * for every intermediate step — `subtotal = unit_price × quantity` is exact
 * (DB CHECK `order_items_subtotal_identity` re-asserts it).
 *
 * SECURITY: this module is server-only. No client-supplied price/stock/name/
 * SKU/total is ever read — the request carries ONLY variant ids + quantities
 * + customer fields (MASTER_PLAN §24).
 */

import { randomInt } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import {
  attributeValues,
  attributes,
  categories,
  customers,
  inventoryMovements,
  orderItems,
  orders,
  productVariants,
  products,
  storeSettings,
  variantAttributeValues,
} from '@/db/schema';
import type { OrderItemAttributeSnapshot } from '@/db/schema/customers-orders';

/** Transaction handle type (matches db.transaction's callback argument). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export {
  normalizeEgyptianPhone,
  moneyToCents,
  moneyForMessage,
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  DEFAULT_WHATSAPP_TEMPLATE_FALLBACK,
} from './whatsapp';
export type {
  WhatsAppOrderLine,
  WhatsAppOrderSummary,
} from './whatsapp';

import {
  DEFAULT_WHATSAPP_TEMPLATE_FALLBACK,
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  moneyToCents,
  normalizeEgyptianPhone,
} from './whatsapp';
import { centsToPriceString } from './cart';

/* -------------------------------------------------------------------------- */
/* Request schema                                                              */
/* -------------------------------------------------------------------------- */

/** Hard cart-size ceiling (mirrors the availability endpoint's 50-id cap). */
export const CHECKOUT_MAX_LINES = 50;
/** Hard per-line quantity ceiling (mirrors the cart domain's MAX_LINE_QUANTITY). */
export const CHECKOUT_MAX_LINE_QUANTITY = 99;

export const checkoutItemSchema = z.object({
  // Arabic field messages (ISSUE-2026-09-30-066 class): the route surfaces the
  // first zod message directly to the customer — never an English default.
  variantId: z.string().uuid('معرّف المنتج غير صالح.'),
  quantity: z
    .number('الكمية غير صالحة.')
    .int('الكمية غير صالحة — يجب أن تكون رقمًا صحيحًا.')
    .min(1, 'الكمية غير صالحة — الحد الأدنى ١.')
    .max(CHECKOUT_MAX_LINE_QUANTITY, `الحد الأقصى للكمية ${CHECKOUT_MAX_LINE_QUANTITY}.`),
});

export const checkoutRequestSchema = z.object({
  items: z.array(checkoutItemSchema).min(1).max(CHECKOUT_MAX_LINES),
  customerName: z.string().trim().min(2, 'الاسم قصير جدًا').max(80),
  // Shape-validated at the schema level so the ROUTE answers 400 with the
  // Arabic field error (the service's normalize is a defensive invariant).
  customerPhone: z
    .string()
    .trim()
    .min(8, 'برجاء كتابة رقم موبايل مصري صحيح (مثال: 01012345678).')
    .max(25, 'برجاء كتابة رقم موبايل مصري صحيح (مثال: 01012345678).')
    .refine((value) => normalizeEgyptianPhone(value) !== null, {
      message: 'برجاء كتابة رقم موبايل مصري صحيح (مثال: 01012345678).',
    }),
  address: z.string().trim().min(5, 'العنوان قصير جدًا').max(500),
  note: z.string().trim().max(500).optional(),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'مفتاح الطلب غير صالح'),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

/**
 * Merge duplicate variant lines by variant identity (the cart domain's
 * semantics — one line per variant per order) and enforce the per-line
 * ceiling on the merged quantity. Returns null when a merged quantity would
 * exceed the cap (hostile request — the client cart can never produce it).
 */
export function mergeCheckoutItems(
  items: CheckoutRequest['items'],
): Array<{ variantId: string; quantity: number }> | null {
  const merged = new Map<string, number>();
  for (const item of items) {
    const next = (merged.get(item.variantId) ?? 0) + item.quantity;
    if (next > CHECKOUT_MAX_LINE_QUANTITY) return null;
    merged.set(item.variantId, next);
  }
  return Array.from(merged, ([variantId, quantity]) => ({ variantId, quantity }));
}

/* -------------------------------------------------------------------------- */
/* Result contracts                                                            */
/* -------------------------------------------------------------------------- */

export type CheckoutLineErrorReason =
  | 'not_found'
  | 'variant_inactive'
  | 'product_unavailable'
  | 'out_of_stock';

export type CheckoutLineError = {
  variantId: string;
  reason: CheckoutLineErrorReason;
  requestedQuantity: number;
  /** Server-truth stock when known (null for unknown variants). */
  availableQuantity: number | null;
};

/** Customer-facing success payload — NO internal ids, NO admin metadata. */
export type CheckoutSuccessPayload = {
  orderNumber: string;
  items: Array<{
    productName: string;
    attributesLabel: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }>;
  productsTotal: string;
  paymentMethod: string;
  whatsappMessage: string;
  whatsappUrl: string;
};

export type CheckoutOutcome =
  | { status: 'created'; payload: CheckoutSuccessPayload }
  /** Duplicate idempotency key — the SAME committed order is re-served. */
  | { status: 'idempotent_replay'; payload: CheckoutSuccessPayload }
  /** Stock/activity failure — nothing was written (transaction returned clean). */
  | { status: 'rejected'; lineErrors: CheckoutLineError[] };

/* -------------------------------------------------------------------------- */
/* Internal row shapes                                                         */
/* -------------------------------------------------------------------------- */

type OrderCoreRow = {
  id: string;
  orderNumber: string;
  productsTotal: string;
  addressSnapshot: string;
  customerNameSnapshot: string;
  whatsappPhoneSnapshot: string;
};

type OrderItemSnapshotRow = {
  productNameSnapshot: string;
  variantAttributesSnapshot: OrderItemAttributeSnapshot[];
  quantity: number;
  unitPrice: string;
  subtotal: string;
};

/** "المقاس: L · اللون: أسود" from a committed attribute snapshot. */
export function attributesToLabel(snapshot: OrderItemAttributeSnapshot[]): string {
  return snapshot.map((a) => `${a.attribute}: ${a.value}`).join(' · ');
}

function buildSuccessPayload(
  order: Omit<OrderCoreRow, 'id'>,
  items: OrderItemSnapshotRow[],
  storeName: string,
  template: string,
): CheckoutSuccessPayload {
  const lines = items.map((item) => ({
    productName: item.productNameSnapshot,
    attributesLabel: attributesToLabel(item.variantAttributesSnapshot),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
  const whatsappMessage = buildWhatsAppMessage(
    {
      storeName,
      orderNumber: order.orderNumber,
      lines,
      productsTotal: order.productsTotal,
      paymentMethod: 'الدفع عند الاستلام',
      customerName: order.customerNameSnapshot,
      address: order.addressSnapshot,
    },
    template,
  );
  return {
    orderNumber: order.orderNumber,
    items: items.map((item) => ({
      productName: item.productNameSnapshot,
      attributesLabel: attributesToLabel(item.variantAttributesSnapshot),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    productsTotal: order.productsTotal,
    paymentMethod: 'الدفع عند الاستلام',
    whatsappMessage,
    whatsappUrl: buildWhatsAppUrl(order.whatsappPhoneSnapshot, whatsappMessage),
  };
}

const ORDER_CORE_COLUMNS = {
  id: orders.id,
  orderNumber: orders.orderNumber,
  productsTotal: orders.productsTotal,
  addressSnapshot: orders.addressSnapshot,
  customerNameSnapshot: orders.customerNameSnapshot,
  whatsappPhoneSnapshot: orders.whatsappPhoneSnapshot,
};

async function buildReplayPayload(order: OrderCoreRow): Promise<CheckoutSuccessPayload> {
  const items = await db
    .select({
      productNameSnapshot: orderItems.productNameSnapshot,
      variantAttributesSnapshot: orderItems.variantAttributesSnapshot,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      subtotal: orderItems.subtotal,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  const settings = await db
    .select({ storeName: storeSettings.storeName, template: storeSettings.whatsappMessageTemplate })
    .from(storeSettings)
    .limit(1);
  return buildSuccessPayload(
    order,
    items,
    settings[0]?.storeName ?? 'أميرة استور',
    settings[0]?.template ?? DEFAULT_WHATSAPP_TEMPLATE_FALLBACK,
  );
}

/* -------------------------------------------------------------------------- */
/* Order number + unique-violation helpers                                     */
/* -------------------------------------------------------------------------- */

const ORDER_NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ORDER_NUMBER_ATTEMPTS = 5;

function generateOrderNumber(): string {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)];
  }
  return `AMR-${suffix}`;
}

/**
 * Unique-violation detection: drizzle ≥0.41 wraps driver errors in
 * `DrizzleQueryError` (original pg error in `cause`), so the pg fields
 * (`code`/`constraint`) are matched down the cause chain.
 */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const candidate = current as { code?: string; constraint?: string; cause?: unknown };
    if (candidate.code === '23505' && candidate.constraint === constraint) return true;
    current = candidate.cause;
  }
  return false;
}

/**
 * Optional pre-commit hook — testability contract ONLY (the rollback proof in
 * scripts/verify-checkout.ts). Never wired from the HTTP route: in production
 * paths it is undefined and nothing runs between the last write and COMMIT.
 */
export type CheckoutTestHooks = {
  onBeforeCommit?: (tx: Tx) => Promise<void>;
};

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export async function createOrderFromCart(
  request: CheckoutRequest,
  hooks: CheckoutTestHooks = {},
): Promise<CheckoutOutcome> {
  // Merge duplicate variant lines (cart identity semantics) BEFORE the
  // transaction; the request schema already validated per-item bounds.
  const mergedItems = mergeCheckoutItems(request.items);
  if (!mergedItems) {
    return {
      status: 'rejected',
      lineErrors: [
        {
          variantId: request.items[0]!.variantId,
          reason: 'out_of_stock',
          requestedQuantity: CHECKOUT_MAX_LINE_QUANTITY,
          availableQuantity: CHECKOUT_MAX_LINE_QUANTITY,
        },
      ],
    };
  }
  const variantIds = mergedItems.map((item) => item.variantId);
  const quantityByVariantId = new Map(mergedItems.map((item) => [item.variantId, item.quantity]));

  // Fast idempotency path (read-only): an existing committed order with this
  // key is re-served as-is. The transaction path below remains the authority
  // for CONCURRENT duplicates (unique index + 23505 → replay).
  const existing = await db.select(ORDER_CORE_COLUMNS).from(orders)
    .where(eq(orders.idempotencyKey, request.idempotencyKey)).limit(1);
  if (existing.length > 0) {
    return { status: 'idempotent_replay', payload: await buildReplayPayload(existing[0]!) };
  }

  // Retry loop: on 23505(idempotency) another transaction committed first —
  // roll back and replay that order. On 23505(order_number) regenerate and
  // retry. Any other error propagates (DB failure = no order, no movement).
  for (let attempt = 0; attempt < ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      return await attemptOrderTransaction(
        request,
        mergedItems,
        quantityByVariantId,
        variantIds,
        hooks,
      );
    } catch (error) {
      if (isUniqueViolation(error, 'orders_idempotency_key_unique')) {
        const replay = await db.select(ORDER_CORE_COLUMNS).from(orders)
          .where(eq(orders.idempotencyKey, request.idempotencyKey)).limit(1);
        if (replay.length > 0) {
          return { status: 'idempotent_replay', payload: await buildReplayPayload(replay[0]!) };
        }
      }
      if (
        isUniqueViolation(error, 'orders_order_number_key') &&
        attempt < ORDER_NUMBER_ATTEMPTS - 1
      ) {
        continue; // regenerate the number and retry the whole transaction
      }
      throw error;
    }
  }
  throw new Error('unreachable: order-number retry loop exhausted');
}

async function attemptOrderTransaction(
  request: CheckoutRequest,
  mergedItems: Array<{ variantId: string; quantity: number }>,
  quantityByVariantId: Map<string, number>,
  variantIds: string[],
  hooks: CheckoutTestHooks,
): Promise<CheckoutOutcome> {
  return db.transaction(async (tx) => {
    /* --- 1. Lock + load every variant with its product (live truth) ------- */
    // `ORDER BY id FOR UPDATE`: deterministic lock order (deadlock-safe) and
    // exclusive row locks — a concurrent checkout of the same variant waits
    // here until this transaction commits, so the stock check below is
    // authoritative and overselling is impossible.
    const variantRows = await tx
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
      .where(inArray(productVariants.id, variantIds))
      .orderBy(productVariants.id)
      .for('update');

    /* --- 2. Category reachability (same rule as the storefront/cart) ------ */
    const categoryRows = await tx
      .select({ id: categories.id, parentId: categories.parentId, isActive: categories.isActive })
      .from(categories);
    const activeById = new Map(categoryRows.map((c) => [c.id, c.isActive]));
    const parentById = new Map(categoryRows.map((c) => [c.id, c.parentId]));
    const isReachable = (categoryId: string): boolean => {
      let current: string | null = categoryId;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        visited.add(current);
        if (activeById.get(current) !== true) return false;
        current = parentById.get(current) ?? null;
      }
      return true;
    };

    /* --- 3. Verify every line (activity + stock) — zero writes so far ----- */
    const rowByVariantId = new Map(variantRows.map((row) => [row.variantId, row]));
    const lineErrors: CheckoutLineError[] = [];
    for (const item of mergedItems) {
      const row = rowByVariantId.get(item.variantId);
      if (!row) {
        lineErrors.push({
          variantId: item.variantId,
          reason: 'not_found',
          requestedQuantity: item.quantity,
          availableQuantity: null,
        });
        continue;
      }
      if (!row.variantActive) {
        lineErrors.push({
          variantId: item.variantId,
          reason: 'variant_inactive',
          requestedQuantity: item.quantity,
          availableQuantity: row.stockQuantity,
        });
        continue;
      }
      if (row.productStatus !== 'active' || !isReachable(row.categoryId)) {
        lineErrors.push({
          variantId: item.variantId,
          reason: 'product_unavailable',
          requestedQuantity: item.quantity,
          availableQuantity: row.stockQuantity,
        });
        continue;
      }
      if (row.stockQuantity < item.quantity) {
        lineErrors.push({
          variantId: item.variantId,
          reason: 'out_of_stock',
          requestedQuantity: item.quantity,
          availableQuantity: row.stockQuantity,
        });
      }
    }
    if (lineErrors.length > 0) {
      // Clean return — the transaction commits zero writes.
      return { status: 'rejected', lineErrors } satisfies CheckoutOutcome;
    }

    /* --- 4. Store settings (WhatsApp number + template come from DATA) ---- */
    const settingsRows = await tx
      .select({
        storeName: storeSettings.storeName,
        whatsappPhone: storeSettings.whatsappPhone,
        template: storeSettings.whatsappMessageTemplate,
      })
      .from(storeSettings)
      .limit(1);
    const settings = settingsRows[0];
    if (!settings) {
      throw new Error('store settings singleton missing');
    }

    /* --- 5. Resolve/create the customer by normalized phone (race-safe) --- */
    const phoneNormalized = normalizeEgyptianPhone(request.customerPhone);
    if (!phoneNormalized) {
      throw new Error('checkout phone failed normalization');
    }
    const customerRows = await tx
      .insert(customers)
      .values({
        name: request.customerName,
        phone: request.customerPhone,
        phoneNormalized,
        addressLastUsed: request.address,
      })
      .onConflictDoUpdate({
        target: customers.phoneNormalized,
        set: {
          name: request.customerName,
          phone: request.customerPhone,
          addressLastUsed: request.address,
          updatedAt: new Date(),
        },
      })
      .returning({ id: customers.id });
    const customerId = customerRows[0]!.id;

    /* --- 6. Prices/totals — LIVE database values only (integer piasters) -- */
    const lineCents = mergedItems.map((item) => {
      const row = rowByVariantId.get(item.variantId)!;
      const unitCents = moneyToCents(row.currentPrice);
      return { item, row, lineTotalCents: unitCents * item.quantity };
    });
    const productsTotalCents = lineCents.reduce((sum, line) => sum + line.lineTotalCents, 0);
    const productsTotal = centsToPriceString(productsTotalCents);

    /* --- 7. Order row (snapshots; shipping stays NULL per MASTER_PLAN §11) - */
    const orderNumber = generateOrderNumber();
    const orderRows = await tx
      .insert(orders)
      .values({
        orderNumber,
        customerId,
        productsTotal,
        shippingCost: null,
        grandTotal: productsTotal, // grand = products + COALESCE(shipping, 0) — DB-checked
        addressSnapshot: request.address,
        customerNameSnapshot: request.customerName,
        customerPhoneSnapshot: request.customerPhone,
        whatsappPhoneSnapshot: settings.whatsappPhone,
        notes: request.note ? request.note : null,
        idempotencyKey: request.idempotencyKey,
      })
      .returning({ id: orders.id });
    const orderId = orderRows[0]!.id;

    /* --- 8. Attribute snapshots for every line (one grouped query) --------- */
    const attributeRows = await tx
      .select({
        variantId: variantAttributeValues.variantId,
        attributeName: attributes.name,
        value: attributeValues.value,
        valueSlug: attributeValues.slug,
      })
      .from(variantAttributeValues)
      .innerJoin(attributeValues, eq(variantAttributeValues.attributeValueId, attributeValues.id))
      .innerJoin(attributes, eq(attributeValues.attributeId, attributes.id))
      .where(inArray(variantAttributeValues.variantId, variantIds));
    const attributesByVariantId = new Map<string, OrderItemAttributeSnapshot[]>();
    for (const row of attributeRows) {
      const list = attributesByVariantId.get(row.variantId) ?? [];
      list.push({ attribute: row.attributeName, value: row.value, valueSlug: row.valueSlug });
      attributesByVariantId.set(row.variantId, list);
    }

    /* --- 9. Order items (full historical snapshots) ------------------------ */
    await tx.insert(orderItems).values(
      lineCents.map(({ item, row, lineTotalCents }) => ({
        orderId,
        productId: row.productId,
        variantId: row.variantId,
        productNameSnapshot: row.productName,
        variantAttributesSnapshot: attributesByVariantId.get(row.variantId) ?? [],
        skuSnapshot: row.sku,
        originalUnitPriceSnapshot: row.originalPrice,
        currentUnitPriceSnapshot: row.currentPrice,
        unitPrice: row.currentPrice,
        quantity: item.quantity,
        subtotal: centsToPriceString(lineTotalCents),
      })),
    );

    /* --- 10. Decrement stock NOW + one ledger movement per line ------------ */
    for (const { item } of lineCents) {
      const updated = await tx
        .update(productVariants)
        .set({ stockQuantity: sql`${productVariants.stockQuantity} - ${item.quantity}` })
        .where(
          // Belt-and-braces under the FOR UPDATE lock: stock can never go
          // negative, even if a future refactor drops the lock.
          sql`${productVariants.id} = ${item.variantId} AND ${productVariants.stockQuantity} >= ${item.quantity}`,
        )
        .returning({ stockAfter: productVariants.stockQuantity });
      const stockAfter = updated[0]?.stockAfter;
      if (stockAfter === undefined) {
        // Impossible under the lock — a guard for invariant safety.
        throw new Error(`stock race detected for variant ${item.variantId}`);
      }
      await tx.insert(inventoryMovements).values({
        variantId: item.variantId,
        orderId,
        movementType: 'sale',
        quantityDelta: -item.quantity,
        stockBefore: stockAfter + item.quantity,
        stockAfter,
        reason: `sale — order ${orderNumber}`,
      });
    }

    /* --- 11. Testability hook (verify:checkout rollback proof ONLY) -------- */
    if (hooks.onBeforeCommit) {
      await hooks.onBeforeCommit(tx);
    }

    /* --- 12. Customer-facing payload STRICTLY from committed values -------- */
    const payload = buildSuccessPayload(
      {
        orderNumber,
        productsTotal,
        addressSnapshot: request.address,
        customerNameSnapshot: request.customerName,
        whatsappPhoneSnapshot: settings.whatsappPhone,
      },
      lineCents.map(({ row, item, lineTotalCents }) => ({
        productNameSnapshot: row.productName,
        variantAttributesSnapshot: attributesByVariantId.get(row.variantId) ?? [],
        quantity: item.quantity,
        unitPrice: row.currentPrice,
        subtotal: centsToPriceString(lineTotalCents),
      })),
      settings.storeName,
      settings.template,
    );

    return { status: 'created', payload } satisfies CheckoutOutcome;
  });
}

/* -------------------------------------------------------------------------- */
/* Deterministic service-test rate limiting. Production API admission uses durable-rate-limit.ts. */
/* -------------------------------------------------------------------------- */

const RATE_LIMIT_WINDOW_MS = 5 * 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 12;
const RATE_LIMIT_MAX_KEYS = 5_000;

const rateBuckets = new Map<string, number[]>();

/**
 * Sliding-window limiter for checkout attempts keyed by a HASHED client IP
 * (raw addresses are never stored). Local-memory = per serverless instance —
 * a documented baseline deterrent, not a distributed control.
 * Returns true when the attempt is allowed.
 */
export function checkoutRateLimit(key: string, now = Date.now()): boolean {
  let stamps = rateBuckets.get(key);
  if (!stamps) {
    if (rateBuckets.size >= RATE_LIMIT_MAX_KEYS) {
      // Bounded memory: drop the oldest bucket when the cap is hit.
      const oldest = [...rateBuckets.entries()].sort(
        (a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0),
      )[0];
      if (oldest) rateBuckets.delete(oldest[0]);
    }
    stamps = [];
    rateBuckets.set(key, stamps);
  }
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (stamps.length > 0 && stamps[0]! < cutoff) stamps.shift();
  if (stamps.length >= RATE_LIMIT_MAX_ATTEMPTS) return false;
  stamps.push(now);
  return true;
}
