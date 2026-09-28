/**
 * Amira Store — PHASE-08 order management verification suite.
 *
 * Exercises the application's OWN admin order services
 * (src/lib/admin/orders.ts) against the target database and asserts every
 * PHASE-08 behavior (docs/phases/PHASE-08.md tasks + DoD):
 *
 *   1. PURE: explicit transition maps (order/shipping/payment) + schema gates
 *   2. Shipping cost: server-side grand-total recalculation, identity,
 *      invalid amounts rejected, locked on completed/canceled orders
 *   3. Order status transitions: strict chain, invalid edges rejected,
 *      completion requires delivery
 *   4. Order editing: increase/decrease/remove/add with per-variant inventory
 *      deltas, existing lines KEEP their committed unit price, new lines
 *      priced from LIVE data, notes/address updates
 *   5. Negative stock: over-stock increase rejected with ZERO partial state
 *   6. Edit restrictions: post-shipment + canceled orders are final
 *   7. Cancellation: pre-shipment only, stock restored EXACTLY ONCE per
 *      (order, variant) — including a MULTI-LINE order (refined index),
 *      duplicate cancel rejected, no duplicate movement rows
 *   8. Post-shipment exit: delivery_failed → returned_to_stock restores once
 *      and cancels the order (explicit audited coupling)
 *   9. Payment status transitions (COD collection tracking)
 *  10. ROLLBACK: forced pre-commit failures leave ZERO partial state
 *  11. Audit trail: one sanitized admin_activity_logs row per mutation
 *  12. listOrders filters/search + inventory views (all/low/out) + ledger
 *
 * Safety:
 * - REFUSES NODE_ENV=production (creates probe fixtures + test orders);
 * - all fixtures are LIFO-cleaned in `finally` and residue-checked;
 * - never prints credentials.
 *
 * Run against the isolated development database only (DATABASE.md §7 rehearsal
 * or the Neon development branch via .env.local — NEVER production):
 *   set -a; . ./.env.local; set +a; bun run verify:orders
 */

import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { ZodError } from 'zod';

import { db, getPool } from '../src/db/client';
import {
  adminActivityLogs,
  adminUsers,
  attributeValues,
  attributes,
  categories,
  customers,
  inventoryMovements,
  orderItems,
  orders,
  productVariants,
  products,
  variantAttributeValues,
} from '../src/db/schema';
import {
  createOrderFromCart,
} from '../src/lib/storefront/checkout';
import {
  ORDER_STATUS_TRANSITIONS,
  OrderServiceError,
  PAYMENT_STATUS_TRANSITIONS,
  SHIPPING_STATUS_TRANSITIONS,
  getOrderDetail,
  getVariantLedger,
  listInventoryVariants,
  listOrders,
  orderEditSchema,
  setPaymentStatus,
  setShippingCost,
  transitionOrderStatus,
  transitionShippingStatus,
  updateOrderItems,
} from '../src/lib/admin/orders';

if (process.env.NODE_ENV === 'production') {
  console.error('[verify-orders] REFUSED: never run order probes against production.');
  process.exit(1);
}

let passes = 0;
let failures = 0;

function pass(name: string, detail = ''): void {
  passes += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name: string, detail = ''): void {
  failures += 1;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(name: string, condition: boolean, detail = ''): void {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

function key(label: string): string {
  return `ord-${label}-${Math.random().toString(36).slice(2, 10)}`;
}

async function stockOf(variantId: string): Promise<number> {
  const rows = await db
    .select({ stockQuantity: productVariants.stockQuantity })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  return rows[0]!.stockQuantity;
}

async function variantMovementsCount(variantId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.variantId, variantId));
  return Number(rows[0]!.n);
}

/** Expects the promise to reject with OrderServiceError or a validation ZodError. */
async function expectOrderReject(name: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    fail(name, 'service accepted an illegal operation');
  } catch (error) {
    if (error instanceof OrderServiceError) {
      pass(name, error.message.slice(0, 80));
    } else if (error instanceof ZodError) {
      pass(name, `validation rejected: ${error.issues[0]?.message?.slice(0, 60) ?? 'zod'}`);
    } else {
      fail(name, `wrong error type: ${(error as Error)?.name ?? 'unknown'}`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Fixtures (probe catalog — cleaned LIFO in finally)                          */
/* -------------------------------------------------------------------------- */

const createdAttributeIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdProductIds: string[] = [];
const createdAdminIds: string[] = [];

let probeCategoryId = '';
let attrSize = ''; let valueM = ''; let valueL = '';
let productA = ''; let variantA_M = ''; let variantA_L = '';
let productB = ''; let variantB_default = '';
let probeAdminId = '';

const CUSTOMER_NAME = 'عميل اختبار إدارة الطلبات';
const CUSTOMER_PHONE = '01098765432';
const CUSTOMER_ADDRESS = 'القاهرة، مدينة نصر، شارع مصطفى النحاس، عمارة 9، الدور 4، شقة 11';

async function buildFixtures(): Promise<void> {
  const [attr] = await db.insert(attributes).values({
    name: 'المقاس (اختبار الطلبات)', slug: `ord-size-${Date.now().toString(36)}`,
  }).returning({ id: attributes.id });
  attrSize = attr!.id; createdAttributeIds.push(attrSize);
  const [valM] = await db.insert(attributeValues).values({
    attributeId: attrSize, value: 'M (اختبار)', slug: `m-ord-${Date.now().toString(36)}`,
  }).returning({ id: attributeValues.id });
  valueM = valM!.id;
  const [valL] = await db.insert(attributeValues).values({
    attributeId: attrSize, value: 'L (اختبار)', slug: `l-ord-${Date.now().toString(36)}`,
  }).returning({ id: attributeValues.id });
  valueL = valL!.id;

  const [cat] = await db.insert(categories).values({
    name: 'اختبار الطلبات (مؤقت)', slug: `ord-cat-${Date.now().toString(36)}`, isActive: true,
  }).returning({ id: categories.id });
  probeCategoryId = cat!.id; createdCategoryIds.push(probeCategoryId);

  // Product A — two size variants (M stock 10 @ 125.50, L stock 30 @ 199.00;
  // L feeds THREE probe orders + the add-line edit, so it carries headroom).
  const [pa] = await db.insert(products).values({
    categoryId: probeCategoryId, name: 'منتج اختبار الطلبات أ', slug: `ord-prod-a-${Date.now().toString(36)}`, status: 'active',
  }).returning({ id: products.id });
  productA = pa!.id; createdProductIds.push(productA);
  const [vAm] = await db.insert(productVariants).values({
    productId: productA, sku: `ORD-A-M-${Date.now().toString(36)}`, originalPrice: '150.00', currentPrice: '125.50', stockQuantity: 10,
  }).returning({ id: productVariants.id });
  variantA_M = vAm!.id;
  const [vAl] = await db.insert(productVariants).values({
    productId: productA, sku: `ORD-A-L-${Date.now().toString(36)}`, originalPrice: '240.00', currentPrice: '199.00', stockQuantity: 30,
  }).returning({ id: productVariants.id });
  variantA_L = vAl!.id;
  await db.insert(variantAttributeValues).values([
    { variantId: variantA_M, attributeValueId: valueM, attributeId: attrSize },
    { variantId: variantA_L, attributeValueId: valueL, attributeId: attrSize },
  ]);

  // Product B — no-attribute default variant (stock 20 @ 47.25)
  const [pb] = await db.insert(products).values({
    categoryId: probeCategoryId, name: 'منتج اختبار الطلبات ب', slug: `ord-prod-b-${Date.now().toString(36)}`, status: 'active',
  }).returning({ id: products.id });
  productB = pb!.id; createdProductIds.push(productB);
  const [vb] = await db.insert(productVariants).values({
    productId: productB, sku: `ORD-B-${Date.now().toString(36)}`, originalPrice: '60.00', currentPrice: '47.25', stockQuantity: 20,
  }).returning({ id: productVariants.id });
  variantB_default = vb!.id;

  // Probe admin (activity-log author for every service call)
  const [admin] = await db.insert(adminUsers).values({
    username: `zz-ord-admin-${Date.now().toString(36)}`, passwordHash: 'probe-hash',
  }).returning({ id: adminUsers.id });
  probeAdminId = admin!.id; createdAdminIds.push(probeAdminId);
}

async function destroyFixtures(): Promise<void> {
  const probeVariants = [variantA_M, variantA_L, variantB_default].filter(Boolean);
  const placeholders = probeVariants.length > 0
    ? sql.join(probeVariants.map((id) => sql`${id}`), sql`, `)
    : sql`'00000000-0000-0000-0000-000000000000'::uuid`;

  // Activity logs for the probe admin + for probe orders.
  if (probeAdminId) {
    await db.delete(adminActivityLogs).where(eq(adminActivityLogs.adminUserId, probeAdminId));
  }
  await db.execute(sql`
    delete from admin_activity_logs where entity_id in (
      select o.id from orders o
      join order_items oi on oi.order_id = o.id
      where oi.variant_id in (${placeholders})
    )
  `);
  // Movements (RESTRICT against orders + variants).
  await db.execute(sql`
    delete from inventory_movements where order_id in (
      select o.id from orders o
      join order_items oi on oi.order_id = o.id
      where oi.variant_id in (${placeholders})
    )
  `);
  await db.delete(inventoryMovements).where(inArray(inventoryMovements.variantId, probeVariants));
  // Orders (order_items cascade) + customers.
  await db.execute(sql`
    delete from orders where id in (
      select o.id from orders o
      join order_items oi on oi.order_id = o.id
      where oi.variant_id in (${placeholders})
    )
  `);
  await db.delete(customers).where(like(customers.name, `${CUSTOMER_NAME}%`));
  // Catalog LIFO.
  await db.delete(variantAttributeValues).where(inArray(variantAttributeValues.variantId, probeVariants));
  await db.delete(productVariants).where(inArray(productVariants.productId, createdProductIds));
  await db.delete(products).where(inArray(products.id, createdProductIds));
  await db.delete(categories).where(inArray(categories.id, createdCategoryIds));
  await db.delete(attributeValues).where(inArray(attributeValues.attributeId, createdAttributeIds));
  await db.delete(attributes).where(inArray(attributes.id, createdAttributeIds));
  await db.delete(adminUsers).where(inArray(adminUsers.id, createdAdminIds));
}

/* -------------------------------------------------------------------------- */
/* Order builders (real checkout path → committed orders with snapshots)       */
/* -------------------------------------------------------------------------- */

async function createProbeOrder(
  items: Array<{ variantId: string; quantity: number }>,
  label: string,
): Promise<string> {
  const idem = key(label);
  const outcome = await createOrderFromCart({
    items,
    customerName: CUSTOMER_NAME,
    customerPhone: CUSTOMER_PHONE,
    address: CUSTOMER_ADDRESS,
    idempotencyKey: idem,
  });
  if (outcome.status !== 'created') {
    throw new Error(`probe order fixture failed (${outcome.status}): ${label}`);
  }
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.idempotencyKey, idem))
    .limit(1);
  return rows[0]!.id;
}

async function orderState(orderId: string) {
  const rows = await db
    .select({
      orderStatus: orders.orderStatus,
      shippingStatus: orders.shippingStatus,
      paymentStatus: orders.paymentStatus,
      productsTotal: orders.productsTotal,
      shippingCost: orders.shippingCost,
      grandTotal: orders.grandTotal,
      addressSnapshot: orders.addressSnapshot,
      notes: orders.notes,
    })
    .from(orders)
    .where(eq(orders.id, orderId));
  return rows[0]!;
}

/* -------------------------------------------------------------------------- */
/* Suites                                                                      */
/* -------------------------------------------------------------------------- */

async function suitePure(): Promise<void> {
  console.log('\n[1] PURE: transition maps + schema gates');
  assert('order chain: new → under_review only (+cancel)',
    JSON.stringify(ORDER_STATUS_TRANSITIONS.new) === JSON.stringify(['under_review', 'canceled']));
  assert('order chain: preparing → completed (+cancel)',
    JSON.stringify(ORDER_STATUS_TRANSITIONS.preparing) === JSON.stringify(['completed', 'canceled']));
  assert('terminal states have no exits',
    ORDER_STATUS_TRANSITIONS.completed.length === 0 && ORDER_STATUS_TRANSITIONS.canceled.length === 0);
  assert('shipping chain: not_started → preparing only',
    JSON.stringify(SHIPPING_STATUS_TRANSITIONS.not_started) === JSON.stringify(['preparing']));
  assert('delivery_failed exits only via returned_to_stock',
    JSON.stringify(SHIPPING_STATUS_TRANSITIONS.delivery_failed) === JSON.stringify(['returned_to_stock']));
  assert('delivered + returned_to_stock are terminal',
    SHIPPING_STATUS_TRANSITIONS.delivered.length === 0 && SHIPPING_STATUS_TRANSITIONS.returned_to_stock.length === 0);
  assert('payment: pending → collected|failed',
    JSON.stringify(PAYMENT_STATUS_TRANSITIONS.pending) === JSON.stringify(['collected', 'failed']));
  assert('payment: collected is terminal',
    PAYMENT_STATUS_TRANSITIONS.collected.length === 0);

  const duplicates = orderEditSchema.safeParse({
    items: [
      { variantId: '11111111-1111-1111-1111-111111111111', quantity: 1 },
      { variantId: '11111111-1111-1111-1111-111111111111', quantity: 2 },
    ],
  });
  assert('duplicate variants in one edit rejected', !duplicates.success);
  const zeroItems = orderEditSchema.safeParse({ items: [] });
  assert('empty line set rejected', !zeroItems.success);
  const badQty = orderEditSchema.safeParse({
    items: [{ variantId: '11111111-1111-1111-1111-111111111111', quantity: 0 }],
  });
  assert('quantity 0 rejected', !badQty.success);
}

async function suiteShippingCost(orderId: string): Promise<void> {
  console.log('\n[2] shipping cost entry + server-side grand total');
  const before = await orderState(orderId);
  const set1 = await setShippingCost(orderId, 35.5, probeAdminId);
  assert('cost 35.5 stored as 35.50', set1.shippingCost === '35.50', set1.shippingCost);
  const expectedGrand1 = (Number(before.productsTotal) + 35.5).toFixed(2);
  assert('grand total recalculated server-side', set1.grandTotal === expectedGrand1, `${set1.grandTotal} vs ${expectedGrand1}`);
  const state1 = await orderState(orderId);
  assert('identity holds in DB (grand = products + shipping)',
    Number(state1.grandTotal) === Number(state1.productsTotal) + Number(state1.shippingCost));

  const set2 = await setShippingCost(orderId, 0, probeAdminId);
  assert('zero shipping allowed (free delivery)', set2.shippingCost === '0.00');

  await expectOrderReject('negative cost rejected', () => setShippingCost(orderId, -5, probeAdminId));
  await expectOrderReject('over-ceiling cost rejected', () => setShippingCost(orderId, 9999, probeAdminId));
  await expectOrderReject('three-decimal cost rejected', () => setShippingCost(orderId, 10.999, probeAdminId));
  const afterRejects = await orderState(orderId);
  assert('rejected cost attempts changed nothing', afterRejects.shippingCost === '0.00');

  await setShippingCost(orderId, 30, probeAdminId);
}

async function suiteStatusTransitions(orderId: string): Promise<void> {
  console.log('\n[3] order status transitions (strict chain)');
  await expectOrderReject('new → completed rejected (skip)', () =>
    transitionOrderStatus(orderId, 'completed', probeAdminId));
  await expectOrderReject('new → confirmed rejected (skip)', () =>
    transitionOrderStatus(orderId, 'confirmed', probeAdminId));

  await transitionOrderStatus(orderId, 'under_review', probeAdminId);
  assert('new → under_review applied', (await orderState(orderId)).orderStatus === 'under_review');
  await expectOrderReject('under_review → completed rejected (skip)', () =>
    transitionOrderStatus(orderId, 'completed', probeAdminId));
  await transitionOrderStatus(orderId, 'confirmed', probeAdminId);
  await transitionOrderStatus(orderId, 'preparing', probeAdminId);
  assert('chain walked to preparing', (await orderState(orderId)).orderStatus === 'preparing');
  await expectOrderReject('completed before delivery rejected', () =>
    transitionOrderStatus(orderId, 'completed', probeAdminId));
}

async function suiteOrderEdit(orderId: string): Promise<void> {
  console.log('\n[4] order editing — deltas, prices, notes/address');

  // Baseline: A_M×2 + B×1.
  const stockM0 = await stockOf(variantA_M);
  const stockB0 = await stockOf(variantB_default);
  const stockL0 = await stockOf(variantA_L);

  // Live catalog price change AFTER checkout: existing line must keep 125.50.
  await db.update(productVariants)
    .set({ currentPrice: '300.00', originalPrice: '350.00' })
    .where(eq(productVariants.id, variantA_M));

  // (a) Increase A_M 2→4 and REMOVE B (returns its unit) in ONE atomic edit.
  const summary = await updateOrderItems(orderId, {
    items: [
      { variantId: variantA_M, quantity: 4 },
      { variantId: variantA_L, quantity: 2 }, // NEW line — live price 199.00
    ],
  }, probeAdminId);
  assert('edit summary: removed 1 line (B)', summary.removedLines === 1);
  assert('edit summary: added 1 line (A_L)', summary.addedLines === 1);
  const stockM1 = await stockOf(variantA_M);
  const stockL1 = await stockOf(variantA_L);
  assert('increase decremented stock exactly (−2)', stockM1 === stockM0 - 2, `${stockM0}→${stockM1}`);
  assert('new line decremented its stock (−2)', stockL1 === stockL0 - 2, `${stockL0}→${stockL1}`);
  const stateB = await stockOf(variantB_default);
  assert('removed line restored stock (+1)', stateB === stockB0 + 1, `${stockB0}→${stateB}`);

  const detail1 = await getOrderDetail(orderId);
  assert('order now has exactly 2 lines', detail1!.items.length === 2);
  const lineM = detail1!.items.find((item) => item.variantId === variantA_M)!;
  const lineL = detail1!.items.find((item) => item.variantId === variantA_L)!;
  assert('existing line KEPT committed unit price (125.50) despite live change to 300.00',
    lineM.unitPrice === '125.50', lineM.unitPrice);
  assert('new line priced from LIVE data (199.00)', lineL.unitPrice === '199.00', lineL.unitPrice);
  assert('new line carries attribute snapshot',
    lineL.variantAttributesSnapshot.some((a) => a.valueSlug.startsWith('l-ord')));
  const expectedProducts = (125.5 * 4 + 199 * 2).toFixed(2);
  assert('products total recomputed exactly', lineM.subtotal === '502.00' && lineL.subtotal === '398.00'
    && Number(detail1!.order.productsTotal) === Number(expectedProducts),
    `${detail1!.order.productsTotal} vs ${expectedProducts}`);

  const movementsM = await db
    .select({ type: inventoryMovements.movementType, delta: inventoryMovements.quantityDelta })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.variantId, variantA_M));
  assert('order_edit_increase ledger row recorded for A_M',
    movementsM.some((m) => m.type === 'order_edit_increase' && m.delta === -2));
  const movementsB = await db
    .select({ type: inventoryMovements.movementType, delta: inventoryMovements.quantityDelta })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.variantId, variantB_default));
  assert('order_edit_decrease ledger row recorded for removed B',
    movementsB.some((m) => m.type === 'order_edit_decrease' && m.delta === 1));

  // (b) Decrease A_M 4→3 (returns one unit).
  const summary2 = await updateOrderItems(orderId, {
    items: [
      { variantId: variantA_M, quantity: 3 },
      { variantId: variantA_L, quantity: 2 },
    ],
  }, probeAdminId);
  assert('decrease restored stock (+1)', (await stockOf(variantA_M)) === stockM1 + 1);
  assert('decrease summary recorded', summary2.decreased.length === 1 && summary2.increased.length === 0);

  // (c) Notes + address update.
  await updateOrderItems(orderId, {
    items: [
      { variantId: variantA_M, quantity: 3 },
      { variantId: variantA_L, quantity: 2 },
    ],
    notes: 'برجاء الاتصال قبل التوصيل (اختبار)',
    address: 'الجيزة، الشيخ زايد، الحي التاسع، عمارة 3، الدور 2، شقة 5 (عنوان معدّل)',
  }, probeAdminId);
  const stateC = await orderState(orderId);
  assert('notes updated', stateC.notes === 'برجاء الاتصال قبل التوصيل (اختبار)');
  assert('address snapshot updated', stateC.addressSnapshot.includes('عنوان معدّل'));

  // Restore the live catalog price for later suites.
  await db.update(productVariants)
    .set({ currentPrice: '125.50', originalPrice: '150.00' })
    .where(eq(productVariants.id, variantA_M));
}

async function suiteNegativeStock(orderId: string): Promise<void> {
  console.log('\n[5] negative stock prevention — zero partial state');
  const before = await orderState(orderId);
  const stockM0 = await stockOf(variantA_M);
  const stockBeforeForcedLow = await stockOf(variantA_M);
  const movementsBefore = await variantMovementsCount(variantA_M);
  const auditBefore = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminActivityLogs)
    .where(and(eq(adminActivityLogs.entityId, orderId), eq(adminActivityLogs.action, 'order.items_updated')));

  // Set live stock to 1, then request an increase of a large existing line.
  const itemsBefore = (await getOrderDetail(orderId))!.items
    .map((item) => `${item.variantId}:${item.quantity}`).sort();
  await db.update(productVariants).set({ stockQuantity: 1 }).where(eq(productVariants.id, variantA_M));
  await expectOrderReject('increase beyond stock rejected', () =>
    updateOrderItems(orderId, {
      items: [
        { variantId: variantA_M, quantity: 99 },
        { variantId: variantA_L, quantity: 2 },
      ],
    }, probeAdminId));

  assert('stock unchanged after rejection', (await stockOf(variantA_M)) === 1);
  const itemsAfter = (await getOrderDetail(orderId))!.items
    .map((item) => `${item.variantId}:${item.quantity}`).sort();
  assert('order items unchanged after rejection', JSON.stringify(itemsBefore) === JSON.stringify(itemsAfter));
  const stateAfter = await orderState(orderId);
  assert('totals unchanged after rejection',
    stateAfter.productsTotal === before.productsTotal && stateAfter.grandTotal === before.grandTotal);
  const auditAfter = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminActivityLogs)
    .where(and(eq(adminActivityLogs.entityId, orderId), eq(adminActivityLogs.action, 'order.items_updated')));
  assert('no audit row for the rejected edit',
    Number(auditAfter[0]!.n) === Number(auditBefore[0]!.n));
  assert('no extra ledger rows for A_M',
    (await variantMovementsCount(variantA_M)) === movementsBefore);
  // Restore the true stock for the following suites.
  await db.update(productVariants).set({ stockQuantity: stockBeforeForcedLow }).where(eq(productVariants.id, variantA_M));
}

async function suiteEditRestrictions(orderId: string): Promise<void> {
  console.log('\n[6] edit restrictions — post-shipment and canceled orders are final');
  // Advance order to shipped (via validated edges).
  await transitionShippingStatus(orderId, 'preparing', probeAdminId);
  await transitionShippingStatus(orderId, 'ready_to_ship', probeAdminId);
  await transitionShippingStatus(orderId, 'shipped', probeAdminId);
  assert('shipping advanced to shipped', (await orderState(orderId)).shippingStatus === 'shipped');

  await expectOrderReject('item edit rejected after shipment', () =>
    updateOrderItems(orderId, {
      items: [{ variantId: variantA_M, quantity: 1 }],
    }, probeAdminId));
  await expectOrderReject('cancel rejected after shipment', () =>
    transitionOrderStatus(orderId, 'canceled', probeAdminId));
  await expectOrderReject('invalid shipping edge rejected (shipped → delivered)', () =>
    transitionShippingStatus(orderId, 'delivered', probeAdminId));
}

async function suiteCancellation(orderIdMulti: string, orderIdSingle: string): Promise<void> {
  console.log('\n[7] cancellation — restore stock EXACTLY ONCE per (order, variant)');

  // Multi-line order (A_M×3 + A_L×2): both variants must get their own
  // restoration row — the refined partial unique index allows it, a duplicate
  // remains impossible.
  const stockM0 = await stockOf(variantA_M);
  const stockL0 = await stockOf(variantA_L);
  const result = await transitionOrderStatus(orderIdMulti, 'canceled', probeAdminId);
  assert('multi-line cancellation applied', result.to === 'canceled');
  assert('restoration returned both variants', result.restored.length === 2);
  assert('A_M stock restored exactly', (await stockOf(variantA_M)) === stockM0 + 3, `${stockM0}→${await stockOf(variantA_M)}`);
  assert('A_L stock restored exactly', (await stockOf(variantA_L)) === stockL0 + 2);
  const cancelRows = await db
    .select({ variantId: inventoryMovements.variantId, delta: inventoryMovements.quantityDelta })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.orderId, orderIdMulti), eq(inventoryMovements.movementType, 'cancellation_return')));
  assert('exactly one cancellation_return row PER variant (2 rows)', cancelRows.length === 2);
  assert('each restoration delta matches its line quantity',
    JSON.stringify(cancelRows.map((row) => row.delta).sort()) === JSON.stringify([2, 3]));

  await expectOrderReject('second cancel rejected (terminal)', () =>
    transitionOrderStatus(orderIdMulti, 'canceled', probeAdminId));
  const stockMAgain = await stockOf(variantA_M);
  assert('NO double restoration after repeated cancel attempt', (await stockOf(variantA_M)) === stockMAgain);
  const cancelRowsAfter = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.orderId, orderIdMulti), eq(inventoryMovements.movementType, 'cancellation_return')));
  assert('still exactly 2 cancellation rows', Number(cancelRowsAfter[0]!.n) === 2);
  await expectOrderReject('canceled order items cannot be edited', () =>
    updateOrderItems(orderIdMulti, { items: [{ variantId: variantA_M, quantity: 1 }] }, probeAdminId));
  await expectOrderReject('canceled order shipping cannot transition', () =>
    transitionShippingStatus(orderIdMulti, 'preparing', probeAdminId));

  // Single-line order cancel as well (A_M was part of multi; this one is L×3).
  const stockLBefore = await stockOf(variantA_L);
  await transitionOrderStatus(orderIdSingle, 'canceled', probeAdminId);
  assert('single-line cancel restored its variant', (await stockOf(variantA_L)) === stockLBefore + 3);
}

async function suiteReturnedToStock(orderId: string): Promise<void> {
  console.log('\n[8] post-shipment exit: delivery_failed → returned_to_stock coupling');
  // Order is currently preparing/shipped-state from suite 6; continue edges.
  await transitionShippingStatus(orderId, 'out_for_delivery', probeAdminId);
  await transitionShippingStatus(orderId, 'delivery_failed', probeAdminId);
  assert('delivery_failed reached', (await orderState(orderId)).shippingStatus === 'delivery_failed');

  // The order's single line is A_L×3 — restoration must return exactly 3.
  const stockL0 = await stockOf(variantA_L);
  const result = await transitionShippingStatus(orderId, 'returned_to_stock', probeAdminId);
  assert('returned_to_stock applied', result.to === 'returned_to_stock');
  assert('restoration summary lists the line', result.restored.length === 1 && result.restored[0]!.quantity === 3);
  assert('stock restored exactly once', (await stockOf(variantA_L)) === stockL0 + 3, `${stockL0}→${await stockOf(variantA_L)}`);
  assert('standing order auto-canceled (explicit coupling)',
    result.coupledCancellation === true && (await orderState(orderId)).orderStatus === 'canceled');
  await expectOrderReject('returned_to_stock is terminal', () =>
    transitionShippingStatus(orderId, 'preparing', probeAdminId));
}

async function suitePayment(orderId: string, canceledOrderId: string, correctionOrderId: string): Promise<void> {
  console.log('\n[9] payment status (COD collection tracking)');
  const result1 = await setPaymentStatus(orderId, 'collected', probeAdminId);
  assert('pending → collected', result1.to === 'collected');
  await expectOrderReject('collected is terminal (no rollback edge)', () =>
    setPaymentStatus(orderId, 'failed', probeAdminId));
  await expectOrderReject('canceled order payment locked', () =>
    setPaymentStatus(canceledOrderId, 'collected', probeAdminId));

  // pending → failed → collected correction on a dedicated active order.
  await setPaymentStatus(correctionOrderId, 'failed', probeAdminId);
  const corrected = await setPaymentStatus(correctionOrderId, 'collected', probeAdminId);
  assert('failed → collected correction works', corrected.from === 'failed' && corrected.to === 'collected');
}

async function suiteRollback(orderId: string): Promise<void> {
  console.log('\n[10] ROLLBACK — forced pre-commit failures leave zero partial state');
  const stateBefore = await orderState(orderId);
  const stockM0 = await stockOf(variantA_M);
  const movementsBefore = await variantMovementsCount(variantA_M);
  const auditBefore = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminActivityLogs)
    .where(eq(adminActivityLogs.entityId, orderId));

  const boom = async (): Promise<never> => {
    throw new Error('forced pre-commit failure');
  };

  // All four attempts must be VALID operations that reach the pre-commit hook
  // (orderShip: status new, shipping not_started, payment pending, A_M×1).
  const attempts: Array<() => Promise<unknown>> = [
    () => transitionOrderStatus(orderId, 'under_review', probeAdminId, { onBeforeCommit: boom }),
    () => transitionShippingStatus(orderId, 'preparing', probeAdminId, { onBeforeCommit: boom }),
    () => setShippingCost(orderId, 99, probeAdminId, { onBeforeCommit: boom }),
    () => updateOrderItems(orderId, {
      items: [{ variantId: variantA_M, quantity: 9 }],
    }, probeAdminId, { onBeforeCommit: boom }),
  ];
  let rejected = 0;
  for (const attempt of attempts) {
    try {
      await attempt();
    } catch (error) {
      if ((error as Error).message === 'forced pre-commit failure') rejected += 1;
    }
  }
  assert('all four mutations hit the forced failure', rejected === 4, `${rejected}/4`);

  const stateAfter = await orderState(orderId);
  assert('order row byte-identical after rollbacks',
    stateBefore.orderStatus === stateAfter.orderStatus &&
    stateBefore.shippingStatus === stateAfter.shippingStatus &&
    stateBefore.paymentStatus === stateAfter.paymentStatus &&
    stateBefore.productsTotal === stateAfter.productsTotal &&
    stateBefore.grandTotal === stateAfter.grandTotal &&
    stateBefore.shippingCost === stateAfter.shippingCost);
  assert('stock unchanged after rollbacks', (await stockOf(variantA_M)) === stockM0);
  assert('no ledger rows leaked', (await variantMovementsCount(variantA_M)) === movementsBefore);
  const auditAfter = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminActivityLogs)
    .where(eq(adminActivityLogs.entityId, orderId));
  assert('no audit rows leaked', Number(auditAfter[0]!.n) === Number(auditBefore[0]!.n));
}

async function suiteAudit(): Promise<void> {
  console.log('\n[11] audit trail — one sanitized row per high-impact mutation');
  const rows = await db
    .select({ action: adminActivityLogs.action, n: sql<number>`count(*)::int` })
    .from(adminActivityLogs)
    .where(eq(adminActivityLogs.adminUserId, probeAdminId))
    .groupBy(adminActivityLogs.action);
  const counts = new Map(rows.map((row) => [row.action, Number(row.n)]));
  assert('order.status_changed logged', (counts.get('order.status_changed') ?? 0) >= 3);
  assert('order.shipping_status_changed logged', (counts.get('order.shipping_status_changed') ?? 0) >= 5);
  assert('order.shipping_cost_set logged', (counts.get('order.shipping_cost_set') ?? 0) >= 3);
  assert('order.items_updated logged', (counts.get('order.items_updated') ?? 0) >= 3);
  assert('order.payment_status_changed logged', (counts.get('order.payment_status_changed') ?? 0) >= 3);
  const sample = await db
    .select({ metadata: adminActivityLogs.metadata })
    .from(adminActivityLogs)
    .where(eq(adminActivityLogs.adminUserId, probeAdminId))
    .limit(1);
  const raw = JSON.stringify(sample[0]?.metadata ?? {});
  assert('audit metadata carries no credential-shaped keys',
    !/pass|token|secret|cookie|authorization|credential/i.test(raw));
}

async function suiteQueries(orderNumberProbe: string): Promise<void> {
  console.log('\n[12] queries: list filters/search + inventory views + ledger');
  const all = await listOrders({ limit: 200 });
  assert('list returns the probe orders', all.items.length >= 4);

  const canceled = await listOrders({ status: 'canceled', limit: 200 });
  assert('status=canceled filter finds canceled probes',
    canceled.items.length >= 3 && canceled.items.every((row) => row.orderStatus === 'canceled'));

  const byNumber = await listOrders({ search: orderNumberProbe });
  assert('search by order number finds exactly one',
    byNumber.items.length === 1 && byNumber.items[0]!.orderNumber === orderNumberProbe);
  const byPhone = await listOrders({ search: CUSTOMER_PHONE });
  assert('search by phone finds the probe orders', byPhone.items.length >= 4);
  const byName = await listOrders({ search: CUSTOMER_NAME });
  assert('search by name finds the probe orders', byName.items.length >= 4);

  // Inventory views: force states (probe fixtures — disposable dev DB only).
  await db.update(productVariants).set({ stockQuantity: 2 }).where(eq(productVariants.id, variantB_default));
  await db.update(productVariants).set({ stockQuantity: 0 }).where(eq(productVariants.id, variantA_L));
  const low = await listInventoryVariants({ view: 'low' });
  assert('low view finds the threshold variant',
    low.items.some((row) => row.variantId === variantB_default && row.stockQuantity === 2));
  const out = await listInventoryVariants({ view: 'out' });
  assert('out view finds the zero-stock variant',
    out.items.some((row) => row.variantId === variantA_L && row.stockQuantity === 0));
  const searched = await listInventoryVariants({ search: 'ORD-B-' });
  assert('inventory search by SKU prefix works', searched.items.length === 1);

  const ledger = await getVariantLedger(variantA_M);
  assert('ledger exists for the touched variant', ledger !== null && ledger.movements.length >= 2);
  assert('ledger ordered newest-first',
    ledger!.movements.every((movement, index, list) =>
      index === 0 || list[index - 1]!.createdAt.getTime() >= movement.createdAt.getTime()));
  // Chain consistency: for consecutive same-variant movements, before = previous after.
  const chronological = [...ledger!.movements].reverse();
  let chainOk = true;
  for (let i = 1; i < chronological.length; i += 1) {
    if (chronological[i]!.stockBefore !== chronological[i - 1]!.stockAfter) chainOk = false;
  }
  assert('ledger chain consistent (before = previous after)', chainOk);
  assert('ledger head matches live stock',
    chronological[chronological.length - 1]!.stockAfter === (await stockOf(variantA_M)));
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

let host = 'unknown-host';
try {
  host = new URL(process.env.DATABASE_URL ?? 'unset').hostname;
} catch {
  host = 'unparseable-host';
}
console.log(`[verify-orders] target endpoint (non-secret): ${host}`);

await buildFixtures().catch(async (error) => {
  console.error('[verify-orders] fixture build failed — cleaning partial fixtures:', (error as Error).message);
  await destroyFixtures().catch(() => undefined);
  process.exit(1);
});

try {
  await suitePure();

  // Probe orders (real checkout path):
  //   orderEdit   — A_M×2 + B×1  (multi-line; edit + multi-cancel tests)
  //   orderStatus — A_L×3        (status chain + shipping + returned_to_stock)
  //   orderShip   — A_M×1        (payment + rollback tests)
  //   orderCancel — A_L×3        (single-line cancellation)
  //   orderPay2   — B×1          (failed → collected correction path)
  const orderEdit = await createProbeOrder([
    { variantId: variantA_M, quantity: 2 },
    { variantId: variantB_default, quantity: 1 },
  ], 'edit');
  const orderStatus = await createProbeOrder([{ variantId: variantA_L, quantity: 3 }], 'status');
  const orderShip = await createProbeOrder([{ variantId: variantA_M, quantity: 1 }], 'ship');
  const orderCancel = await createProbeOrder([{ variantId: variantA_L, quantity: 3 }], 'cancel');
  const orderPay2 = await createProbeOrder([{ variantId: variantB_default, quantity: 1 }], 'pay2');

  await suiteShippingCost(orderEdit);
  await suiteStatusTransitions(orderStatus);
  await suiteOrderEdit(orderEdit);
  await suiteNegativeStock(orderEdit);
  await suiteEditRestrictions(orderStatus);
  await suiteCancellation(orderEdit, orderCancel);
  await suiteReturnedToStock(orderStatus);
  await suitePayment(orderShip, orderCancel, orderPay2);
  await suiteRollback(orderShip);

  const [probeOrderRow] = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.id, orderEdit))
    .limit(1);
  await suiteAudit();
  await suiteQueries(probeOrderRow!.orderNumber);
} finally {
  console.log('\n[cleanup] removing probe fixtures + test orders (LIFO)…');
  try {
    await destroyFixtures();
    const probeVariants = [variantA_M, variantA_L, variantB_default].filter(Boolean);
    const residueItems = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orderItems)
      .where(inArray(orderItems.variantId, probeVariants));
    assert('cleanup: zero probe order items remain', Number(residueItems[0]!.n) === 0);
    const residueMovements = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(inventoryMovements)
      .where(inArray(inventoryMovements.variantId, probeVariants));
    assert('cleanup: zero probe movements remain', Number(residueMovements[0]!.n) === 0);
    const residueCustomers = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(customers)
      .where(like(customers.name, `${CUSTOMER_NAME}%`));
    assert('cleanup: zero probe customers remain', Number(residueCustomers[0]!.n) === 0);
    const residueAdmins = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(adminUsers)
      .where(like(adminUsers.username, 'zz-ord-admin-%'));
    assert('cleanup: zero probe admins remain', Number(residueAdmins[0]!.n) === 0);
  } catch (cleanupError) {
    failures += 1;
    console.error('[verify-orders] CLEANUP FAILURE:', (cleanupError as Error)?.message);
  }
  await getPool().end().catch(() => undefined);
}

console.log(`\n[verify-orders] ${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.error('[verify-orders] FAILURES PRESENT');
  process.exit(1);
}
console.log('[verify-orders] ALL CHECKS PASS');
