/**
 * Amira Store — PHASE-07 checkout verification suite.
 *
 * Exercises the application's OWN checkout service (src/lib/storefront/
 * checkout.ts) against the target database and asserts every PHASE-07
 * behavior, including the four MANDATORY correctness proofs
 * (docs/phases/PHASE-07.md DoD):
 *
 *   1. phone normalization (pure) + request merge/schema rejections (pure)
 *   2. WhatsApp message/URL builder (pure; template fill + URL encoding)
 *   3. happy-path order: snapshots, stock decrement, ledger movement,
 *      totals identity, customer upsert, order-number format
 *   4. variant identity semantics (separate lines per variant; duplicates merge)
 *   5. PRICE TAMPERING: client price fields are absent from the contract and
 *      ignored; the LIVE database price is charged (incl. after a price change)
 *   6. stock/activity rejection: no order, no movement, no stock change
 *   7. IDEMPOTENCY: sequential + CONCURRENT duplicate keys → exactly one order
 *   8. CONCURRENCY: parallel checkouts competing for limited stock cannot
 *      oversell (exactly one wins; stock never negative; ledger consistent)
 *   9. ROLLBACK: a forced pre-commit failure leaves ZERO partial state
 *  10. snapshot integrity: later catalog edits never change committed orders
 *  11. customer resolution by normalized phone across display forms
 *  12. per-instance rate limiter + payload safety (no internal ids)
 *
 * Safety:
 * - REFUSES NODE_ENV=production (creates probe fixtures + test orders);
 * - all fixtures are LIFO-cleaned in `finally` and residue-checked;
 * - never prints credentials.
 *
 * Run against the isolated development database only (DATABASE.md §7 rehearsal
 * or the Neon development branch via .env.local — NEVER production):
 *   set -a; . ./.env.local; set +a; bun run verify:checkout
 */

import { eq, inArray, like, sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
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
  variantAttributeValues,
} from '../src/db/schema';
import {
  CHECKOUT_MAX_LINE_QUANTITY,
  checkoutRequestSchema,
  createOrderFromCart,
  mergeCheckoutItems,
} from '../src/lib/storefront/checkout';
import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  moneyForMessage,
  normalizeEgyptianPhone,
} from '../src/lib/storefront/whatsapp';

if (process.env.NODE_ENV === 'production') {
  console.error('[verify-checkout] REFUSED: never run checkout probes against production.');
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
  return `chk-${label}-${Math.random().toString(36).slice(2, 10)}`;
}

async function countRows(table: 'orders' | 'order_items' | 'inventory_movements' | 'customers'): Promise<number> {
  const result = await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`);
  return Number((result.rows[0] as { n: number }).n);
}

async function stockOf(variantId: string): Promise<number> {
  const rows = await db
    .select({ stockQuantity: productVariants.stockQuantity })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  return rows[0]!.stockQuantity;
}

async function movementsOf(variantId: string): Promise<Array<{
  quantityDelta: number; stockBefore: number; stockAfter: number; movementType: string; orderId: string | null;
}>> {
  return db
    .select({
      quantityDelta: inventoryMovements.quantityDelta,
      stockBefore: inventoryMovements.stockBefore,
      stockAfter: inventoryMovements.stockAfter,
      movementType: inventoryMovements.movementType,
      orderId: inventoryMovements.orderId,
    })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.variantId, variantId));
}

async function ordersWithKey(idempotencyKey: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.idempotencyKey, idempotencyKey));
  return Number(rows[0]!.n);
}

/* -------------------------------------------------------------------------- */
/* Fixtures (probe catalog — cleaned LIFO in finally)                          */
/* -------------------------------------------------------------------------- */

const createdAttributeIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdProductIds: string[] = [];
const createdCustomerNames: string[] = [];

let probeCategoryId = '';
let attrM = ''; let valueM = ''; let valueL = '';
let productA = ''; let variantA_M = ''; let variantA_L = '';
let productB = ''; let variantB_default = ''; let variantB_inactive = '';
let productC_archived = ''; let variantC_archived = '';

async function buildFixtures(): Promise<void> {
  // Attribute + values (size)
  const [attr] = await db.insert(attributes).values({
    name: 'المقاس (اختبار الدفع)', slug: `chk-size-${Date.now().toString(36)}`,
  }).returning({ id: attributes.id });
  attrM = attr!.id; createdAttributeIds.push(attrM);
  const [valM] = await db.insert(attributeValues).values({
    attributeId: attrM, value: 'M (اختبار)', slug: `m-chk-${Date.now().toString(36)}`,
  }).returning({ id: attributeValues.id });
  valueM = valM!.id;
  const [valL] = await db.insert(attributeValues).values({
    attributeId: attrM, value: 'L (اختبار)', slug: `l-chk-${Date.now().toString(36)}`,
  }).returning({ id: attributeValues.id });
  valueL = valL!.id;

  // Category
  const [cat] = await db.insert(categories).values({
    name: 'اختبار الدفع (مؤقت)', slug: `chk-cat-${Date.now().toString(36)}`, isActive: true,
  }).returning({ id: categories.id });
  probeCategoryId = cat!.id; createdCategoryIds.push(probeCategoryId);

  // Product A — two size variants (M stock 10 @125.50, L stock 2 @199.00)
  const [pa] = await db.insert(products).values({
    categoryId: probeCategoryId, name: 'منتج اختبار الدفع أ', slug: `chk-prod-a-${Date.now().toString(36)}`, status: 'active',
  }).returning({ id: products.id });
  productA = pa!.id; createdProductIds.push(productA);
  const [vAm] = await db.insert(productVariants).values({
    productId: productA, sku: `CHK-A-M-${Date.now().toString(36)}`, originalPrice: '150.00', currentPrice: '125.50', stockQuantity: 10,
  }).returning({ id: productVariants.id });
  variantA_M = vAm!.id;
  const [vAl] = await db.insert(productVariants).values({
    productId: productA, sku: `CHK-A-L-${Date.now().toString(36)}`, originalPrice: '240.00', currentPrice: '199.00', stockQuantity: 2,
  }).returning({ id: productVariants.id });
  variantA_L = vAl!.id;
  await db.insert(variantAttributeValues).values([
    { variantId: variantA_M, attributeValueId: valueM, attributeId: attrM },
    { variantId: variantA_L, attributeValueId: valueL, attributeId: attrM },
  ]);

  // Product B — no-attribute default variant (stock 100 @47.25) + an inactive sibling
  const [pb] = await db.insert(products).values({
    categoryId: probeCategoryId, name: 'منتج اختبار الدفع ب', slug: `chk-prod-b-${Date.now().toString(36)}`, status: 'active',
  }).returning({ id: products.id });
  productB = pb!.id; createdProductIds.push(productB);
  const [vb] = await db.insert(productVariants).values({
    productId: productB, sku: `CHK-B-${Date.now().toString(36)}`, originalPrice: '60.00', currentPrice: '47.25', stockQuantity: 100,
  }).returning({ id: productVariants.id });
  variantB_default = vb!.id;
  const [vbi] = await db.insert(productVariants).values({
    productId: productB, sku: `CHK-B-INACT-${Date.now().toString(36)}`, originalPrice: '60.00', currentPrice: '47.25', stockQuantity: 50, isActive: false,
  }).returning({ id: productVariants.id });
  variantB_inactive = vbi!.id;

  // Product C — ARCHIVED (product_unavailable) with an active variant
  const [pc] = await db.insert(products).values({
    categoryId: probeCategoryId, name: 'منتج اختبار الدفع ج (مؤرشف)', slug: `chk-prod-c-${Date.now().toString(36)}`, status: 'archived',
  }).returning({ id: products.id });
  productC_archived = pc!.id; createdProductIds.push(productC_archived);
  const [vc] = await db.insert(productVariants).values({
    productId: productC_archived, sku: `CHK-C-${Date.now().toString(36)}`, originalPrice: '80.00', currentPrice: '75.00', stockQuantity: 20,
  }).returning({ id: productVariants.id });
  variantC_archived = vc!.id;
}

async function destroyFixtures(): Promise<void> {
  // LIFO: movements (RESTRICT variant/order) → order_items (cascade with order)
  // → orders → variant_attribute_values → variants → products → category → values → attribute.
  await db.delete(inventoryMovements).where(inArray(inventoryMovements.variantId, [
    variantA_M, variantA_L, variantB_default, variantB_inactive, variantC_archived,
  ].filter(Boolean)));
  // Every probe order (any idempotency key) links to a probe variant via order_items.
  await db.execute(sql`
    delete from orders where id in (
      select o.id from orders o
      join order_items oi on oi.order_id = o.id
      where oi.variant_id in (${variantA_M || '00000000-0000-0000-0000-000000000000'}, ${variantA_L || '00000000-0000-0000-0000-000000000000'}, ${variantB_default || '00000000-0000-0000-0000-000000000000'}, ${variantB_inactive || '00000000-0000-0000-0000-000000000000'}, ${variantC_archived || '00000000-0000-0000-0000-000000000000'})
    )
  `);
  await db.delete(customers).where(like(customers.name, 'عميل اختبار الدفع%'));
  await db.delete(variantAttributeValues).where(inArray(variantAttributeValues.variantId, [
    variantA_M, variantA_L, variantB_default, variantB_inactive, variantC_archived,
  ].filter(Boolean)));
  await db.delete(productVariants).where(inArray(productVariants.productId, createdProductIds));
  await db.delete(products).where(inArray(products.id, createdProductIds));
  await db.delete(categories).where(inArray(categories.id, createdCategoryIds));
  await db.delete(attributeValues).where(inArray(attributeValues.attributeId, createdAttributeIds));
  await db.delete(attributes).where(inArray(attributes.id, createdAttributeIds));
}

/* -------------------------------------------------------------------------- */
/* Request builders                                                            */
/* -------------------------------------------------------------------------- */

function buildRequest(overrides: {
  items?: Array<{ variantId: string; quantity: number }>;
  name?: string; phone?: string; address?: string; note?: string; idem?: string;
} = {}) {
  return {
    items: overrides.items ?? [{ variantId: variantA_M, quantity: 2 }],
    customerName: overrides.name ?? 'عميل اختبار الدفع الأول',
    customerPhone: overrides.phone ?? '01012345678',
    address: overrides.address ?? 'القاهرة، مدينة نصر، شارع التسعين الشمالي، عمارة 12، الدور 3، الدور الأرضي بجانب الصيدلية',
    note: overrides.note,
    idempotencyKey: overrides.idem ?? key('req'),
  } satisfies Parameters<typeof createOrderFromCart>[0];
}

/* -------------------------------------------------------------------------- */
/* Suites                                                                      */
/* -------------------------------------------------------------------------- */

async function suitePure(): Promise<void> {
  console.log('\n[1] phone normalization (Egypt mobile)');
  assert('local form normalizes', normalizeEgyptianPhone('01012345678') === '+201012345678');
  assert('+20 form normalizes', normalizeEgyptianPhone('+201012345678') === '+201012345678');
  assert('0020 form normalizes', normalizeEgyptianPhone('00201012345678') === '+201012345678');
  assert('bare 20 form normalizes', normalizeEgyptianPhone('201012345678') === '+201012345678');
  assert('spaces/dashes tolerated', normalizeEgyptianPhone('+20 101-234-5678') === '+201012345678');
  assert('11 → 12 prefix valid', normalizeEgyptianPhone('01198765432') === '+201198765432');
  assert('15 prefix valid', normalizeEgyptianPhone('01512345678') === '+201512345678');
  assert('landline rejected', normalizeEgyptianPhone('0223456789') === null);
  assert('wrong leading digit rejected', normalizeEgyptianPhone('01912345678') === null);
  assert('short number rejected', normalizeEgyptianPhone('010123') === null);
  assert('letters rejected', normalizeEgyptianPhone('0101abc5678') === null);
  assert('empty rejected', normalizeEgyptianPhone('') === null);

  console.log('\n[2] request schema + variant-identity merge');
  assert('duplicate variants merge (2+3 → 5)',
    JSON.stringify(mergeCheckoutItems([
      { variantId: variantA_M, quantity: 2 }, { variantId: variantA_M, quantity: 3 },
    ])) === JSON.stringify([{ variantId: variantA_M, quantity: 5 }]));
  assert('merged ceiling enforced (99+1 → null)',
    mergeCheckoutItems([
      { variantId: variantA_M, quantity: CHECKOUT_MAX_LINE_QUANTITY }, { variantId: variantA_M, quantity: 1 },
    ]) === null);
  const badBodies: Array<[string, unknown]> = [
    ['empty items', { items: [], customerName: 'عميل اختبار', customerPhone: '01012345678', address: 'عنوان كامل هنا', idempotencyKey: key('x') }],
    ['zero quantity', { items: [{ variantId: variantA_M, quantity: 0 }], customerName: 'عميل اختبار', customerPhone: '01012345678', address: 'عنوان كامل هنا', idempotencyKey: key('x') }],
    ['non-integer quantity', { items: [{ variantId: variantA_M, quantity: 1.5 }], customerName: 'عميل اختبار', customerPhone: '01012345678', address: 'عنوان كامل هنا', idempotencyKey: key('x') }],
    ['non-uuid variant', { items: [{ variantId: 'not-a-uuid', quantity: 1 }], customerName: 'عميل اختبار', customerPhone: '01012345678', address: 'عنوان كامل هنا', idempotencyKey: key('x') }],
    ['one-char name', { items: [{ variantId: variantA_M, quantity: 1 }], customerName: 'ا', customerPhone: '01012345678', address: 'عنوان كامل هنا', idempotencyKey: key('x') }],
    ['bad phone shape', { items: [{ variantId: variantA_M, quantity: 1 }], customerName: 'عميل اختبار', customerPhone: '0223456789', address: 'عنوان كامل هنا', idempotencyKey: key('x') }],
    ['short address', { items: [{ variantId: variantA_M, quantity: 1 }], customerName: 'عميل اختبار', customerPhone: '01012345678', address: 'قصير', idempotencyKey: key('x') }],
    ['short idempotency key', { items: [{ variantId: variantA_M, quantity: 1 }], customerName: 'عميل اختبار', customerPhone: '01012345678', address: 'عنوان كامل هنا', idempotencyKey: 'ab' }],
    ['key with spaces', { items: [{ variantId: variantA_M, quantity: 1 }], customerName: 'عميل اختبار', customerPhone: '01012345678', address: 'عنوان كامل هنا', idempotencyKey: 'has space 123' }],
  ];
  for (const [label, body] of badBodies) {
    assert(`schema rejects: ${label}`, !checkoutRequestSchema.safeParse(body).success);
  }

  console.log('\n[3] WhatsApp message/URL builder (pure)');
  const summary = {
    storeName: 'أميرة استور',
    orderNumber: 'AMR-TEST01',
    lines: [
      { productName: 'منتج اختبار الدفع أ', attributesLabel: 'المقاس (اختبار الدفع): M (اختبار)', quantity: 2, unitPrice: '125.50' },
      { productName: 'منتج اختبار الدفع ب', attributesLabel: '', quantity: 1, unitPrice: '47.25' },
    ],
    productsTotal: '298.25',
    paymentMethod: 'الدفع عند الاستلام',
    customerName: 'عميل اختبار',
    address: 'القاهرة، مدينة نصر',
  };
  const message2 = buildWhatsAppMessage(summary, 'مرحبًا {store_name} 👋\n{order_number}\n{items}\n{products_total}\n{payment_method}\n{customer_name}\n{address}\n{shipping_note} {unknown_key}');
  assert('greeting present', message2.includes('مرحبًا أميرة استور 👋'));
  assert('order number present', message2.includes('AMR-TEST01'));
  assert('product name present', message2.includes('منتج اختبار الدفع أ'));
  assert('variant attributes present', message2.includes('(المقاس (اختبار الدفع): M (اختبار))'));
  assert('no-attribute line renders bare', message2.includes('منتج اختبار الدفع ب ×1 — 47.25 جنيه'));
  assert('quantity + unit price present', message2.includes('×2 — 125.5 جنيه'));
  assert('products total present', message2.includes('298.25'));
  assert('COD present', message2.includes('الدفع عند الاستلام'));
  assert('address present', message2.includes('القاهرة، مدينة نصر'));
  assert('unknown placeholder preserved (visible template typo)', message2.includes('{shipping_note} {unknown_key}'));
  const url = buildWhatsAppUrl('+201019003677', message2);
  assert('wa.me digits-only number', url.startsWith('https://wa.me/201019003677?text='));
  assert('URL round-trips the message', decodeURIComponent(url.split('text=')[1]!) === message2);
  assert('moneyForMessage trims trailing zeros', moneyForMessage('125.50') === '125.5' && moneyForMessage('298.00') === '298');
}

async function suiteHappyPath(): Promise<string> {
  console.log('\n[4] happy path — one transactional order');
  const stockBefore = await stockOf(variantA_M);
  const ordersBefore = await countRows('orders');
  const movementsBefore = (await movementsOf(variantA_M)).length;
  const request = buildRequest({ idem: key('happy') });

  const outcome = await createOrderFromCart(request);
  assert('outcome created', outcome.status === 'created');
  if (outcome.status !== 'created') return '';

  const payload = outcome.payload;
  assert('order number format AMR-XXXXXX', /^AMR-[A-HJ-NP-Z2-9]{6}$/.test(payload.orderNumber), payload.orderNumber);
  assert('one item line', payload.items.length === 1);
  assert('item snapshot name', payload.items[0]!.productName === 'منتج اختبار الدفع أ');
  assert('item snapshot attributes', payload.items[0]!.attributesLabel.includes('M (اختبار)'));
  assert('item unit price = LIVE DB price', payload.items[0]!.unitPrice === '125.50');
  assert('line subtotal = unit × qty', payload.items[0]!.subtotal === '251.00');
  assert('products total exact', payload.productsTotal === '251.00');
  assert('payment method = COD', payload.paymentMethod === 'الدفع عند الاستلام');
  assert('whatsapp message contains order number', payload.whatsappMessage.includes(payload.orderNumber));
  assert('whatsapp message contains item line', payload.whatsappMessage.includes('×2 — 125.5 جنيه'));
  assert('whatsapp message contains shipping note', payload.whatsappMessage.includes('برجاء الاتفاق على تكلفة الشحن عبر واتساب'));
  assert('whatsapp message contains closing', payload.whatsappMessage.includes('شكرًا لكم'));
  assert('whatsapp URL encodes the message', decodeURIComponent(payload.whatsappUrl.split('text=')[1]!) === payload.whatsappMessage);
  assert('whatsapp URL targets settings number digits', payload.whatsappUrl.startsWith('https://wa.me/201019003677'));

  assert('stock decremented exactly once', (await stockOf(variantA_M)) === stockBefore - 2);
  assert('orders +1', (await countRows('orders')) === ordersBefore + 1);
  const movements = await movementsOf(variantA_M);
  assert('one new sale movement', movements.length === movementsBefore + 1);
  const sale = movements[movements.length - 1]!;
  assert('movement type sale', sale.movementType === 'sale');
  assert('movement delta −2', sale.quantityDelta === -2);
  assert('movement before/after identity', sale.stockBefore === stockBefore && sale.stockAfter === stockBefore - 2);

  const orderRows = await db.select().from(orders).where(eq(orders.idempotencyKey, request.idempotencyKey));
  assert('order row exists with the key', orderRows.length === 1);
  const orderRow = orderRows[0]!;
  assert('grand_total identity (shipping NULL)', orderRow.grandTotal === orderRow.productsTotal);
  assert('address snapshot stored', orderRow.addressSnapshot === request.address);
  assert('customer name snapshot stored', orderRow.customerNameSnapshot === request.customerName);
  assert('whatsapp phone snapshot = settings value', orderRow.whatsappPhoneSnapshot === '+201019003677');
  assert('order status new / COD / pending', orderRow.orderStatus === 'new' && orderRow.paymentMethod === 'cod' && orderRow.paymentStatus === 'pending');

  const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, orderRow.id));
  assert('order_items row written', itemRows.length === 1);
  assert('item original price snapshot', itemRows[0]!.originalUnitPriceSnapshot === '150.00');
  assert('item current price snapshot', itemRows[0]!.currentUnitPriceSnapshot === '125.50');
  assert('item sku snapshot', itemRows[0]!.skuSnapshot.startsWith('CHK-A-M-'));
  assert('item attributes snapshot jsonb', itemRows[0]!.variantAttributesSnapshot.length === 1
    && itemRows[0]!.variantAttributesSnapshot[0]!.attribute.startsWith('المقاس')
    && itemRows[0]!.variantAttributesSnapshot[0]!.value.startsWith('M'));

  const customerRows = await db.select().from(customers).where(eq(customers.phoneNormalized, '+201012345678'));
  assert('customer resolved/created by normalized phone', customerRows.length === 1);
  assert('customer address_last_used stored', customerRows[0]!.addressLastUsed === request.address);
  createdCustomerNames.push(request.customerName);

  return orderRow.id;
}

async function suiteVariantSemantics(): Promise<void> {
  console.log('\n[5] variant identity — separate lines, duplicates merge');
  const outcome = await createOrderFromCart(buildRequest({
    items: [
      { variantId: variantA_M, quantity: 1 },
      { variantId: variantA_L, quantity: 1 },
      { variantId: variantB_default, quantity: 3 },
    ],
    idem: key('semantics'),
  }));
  assert('multi-variant order created', outcome.status === 'created');
  if (outcome.status !== 'created') return;
  assert('three distinct lines', outcome.payload.items.length === 3);
  const total = Number(outcome.payload.productsTotal);
  const expected = 125.5 + 199 + 47.25 * 3;
  assert('multi-line total exact (125.50 + 199.00 + 3×47.25)', Math.abs(total - expected) < 1e-9, String(total));

  const mergeKey = key('merge');
  const merged = await createOrderFromCart(buildRequest({
    items: [
      { variantId: variantB_default, quantity: 1 },
      { variantId: variantB_default, quantity: 2 },
    ],
    idem: mergeKey,
  }));
  assert('duplicate variant merges to one line qty 3', merged.status === 'created' && merged.payload.items.length === 1 && merged.payload.items[0]!.quantity === 3);
  if (merged.status === 'created') {
    const mergeOrder = await db.select({ id: orders.id }).from(orders).where(eq(orders.idempotencyKey, mergeKey)).limit(1);
    const rows = await db.select({ n: sql<number>`count(*)::int` }).from(orderItems)
      .where(eq(orderItems.orderId, mergeOrder[0]!.id));
    assert('single order_items row for the merged line', Number(rows[0]!.n) === 1);
  }
}

async function suiteTampering(): Promise<void> {
  console.log('\n[6] price tampering — client values ignored, LIVE price charged');
  // (a) hostile request with extra price/total/name fields — zod strips them.
  const hostile = {
    items: [{ variantId: variantB_default, quantity: 1, unitPrice: '1.00', productName: 'FAKE', sku: 'FAKE-SKU' }],
    customerName: 'عميل اختبار الدفع الأول', customerPhone: '01012345678',
    address: 'القاهرة، مدينة نصر، شارع التسعين الشمالي، عمارة 12، الدور 3',
    productsTotal: '1.00', grandTotal: '1.00',
    idempotencyKey: key('tamper'),
  } as unknown as Parameters<typeof createOrderFromCart>[0];
  const parsed = checkoutRequestSchema.safeParse(hostile);
  assert('schema parses hostile body (unknown keys stripped, no error)', parsed.success);
  if (parsed.success) {
    const outcome = await createOrderFromCart(parsed.data);
    assert('tampered order created', outcome.status === 'created');
    if (outcome.status === 'created') {
      assert('charged LIVE price 47.25 (not 1.00)', outcome.payload.items[0]!.unitPrice === '47.25' && outcome.payload.productsTotal === '47.25');
      assert('product name from DB (not FAKE)', outcome.payload.items[0]!.productName === 'منتج اختبار الدفع ب');
    }
  }
  // (b) LIVE price change between orders — the next order pays the NEW price.
  await db.update(productVariants).set({ currentPrice: '52.00' }).where(eq(productVariants.id, variantB_default));
  const tamper2Key = key('tamper2');
  const after = await createOrderFromCart(buildRequest({
    items: [{ variantId: variantB_default, quantity: 2 }], idem: tamper2Key,
  }));
  assert('post-change order uses the NEW live price 52.00 ×2 = 104.00',
    after.status === 'created' && after.payload.items[0]!.unitPrice === '52.00' && after.payload.productsTotal === '104.00');
  if (after.status === 'created') {
    const rows = await db.select().from(orderItems)
      .where(eq(orderItems.orderId, (await db.select({ id: orders.id }).from(orders).where(eq(orders.idempotencyKey, tamper2Key)).limit(1))[0]!.id));
    assert('order item snapshot keeps the NEW current + UNCHANGED original', rows[0]!.unitPrice === '52.00' && rows[0]!.originalUnitPriceSnapshot === '60.00');
  }
  // restore the seed-like price for later sections/cleanup symmetry
  await db.update(productVariants).set({ currentPrice: '47.25' }).where(eq(productVariants.id, variantB_default));
}

async function suiteRejections(): Promise<void> {
  console.log('\n[7] stock/activity rejection — nothing written');
  const ordersBefore = await countRows('orders');
  const movementsBefore = (await movementsOf(variantA_L)).length;
  const stockBefore = await stockOf(variantA_L);
  const stockGoodBefore = await stockOf(variantA_M);

  const stockFail = await createOrderFromCart(buildRequest({
    items: [{ variantId: variantA_L, quantity: stockBefore + 1 }], idem: key('stockfail'),
  }));
  assert('oversized quantity rejected', stockFail.status === 'rejected');
  if (stockFail.status === 'rejected') {
    assert('reason out_of_stock', stockFail.lineErrors[0]!.reason === 'out_of_stock');
    assert('availableQuantity = server-truth stock', stockFail.lineErrors[0]!.availableQuantity === stockBefore);
  }
  assert('stock failure = NO order', (await countRows('orders')) === ordersBefore);
  assert('stock failure = NO movement', (await movementsOf(variantA_L)).length === movementsBefore);
  assert('stock failure = NO stock change', (await stockOf(variantA_L)) === stockBefore);

  console.log('\n[8] inactive variant / archived product / unknown variant');
  const inactive = await createOrderFromCart(buildRequest({
    items: [{ variantId: variantB_inactive, quantity: 1 }], idem: key('inact'),
  }));
  assert('inactive variant rejected', inactive.status === 'rejected' && inactive.lineErrors[0]!.reason === 'variant_inactive');

  const archived = await createOrderFromCart(buildRequest({
    items: [{ variantId: variantC_archived, quantity: 1 }], idem: key('arch'),
  }));
  assert('archived product rejected (unreachable)', archived.status === 'rejected' && archived.lineErrors[0]!.reason === 'product_unavailable');

  const unknown = await createOrderFromCart(buildRequest({
    items: [{ variantId: '00000000-0000-4000-8000-000000000000', quantity: 1 }], idem: key('unknown'),
  }));
  assert('unknown variant rejected (not_found)', unknown.status === 'rejected' && unknown.lineErrors[0]!.reason === 'not_found');

  const mixed = await createOrderFromCart(buildRequest({
    items: [
      { variantId: variantA_M, quantity: 1 },
      { variantId: variantB_inactive, quantity: 1 },
    ], idem: key('mixed'),
  }));
  const stockAfterMixed = await stockOf(variantA_M);
  assert('mixed cart (good + bad) rejected WHOLE', mixed.status === 'rejected');
  assert('unavailable items are never silently accepted (good line not consumed)', stockAfterMixed === stockGoodBefore);
  assert('no partial order for mixed cart', (await countRows('orders')) === ordersBefore);
}

async function suiteIdempotency(): Promise<void> {
  console.log('\n[9] idempotency — sequential duplicate keys');
  const idem = key('idem-seq');
  const first = await createOrderFromCart(buildRequest({ idem }));
  assert('first submission creates', first.status === 'created');
  const ordersAfterFirst = await countRows('orders');

  const second = await createOrderFromCart(buildRequest({ idem }));
  assert('duplicate submission returns idempotent_replay', second.status === 'idempotent_replay');
  if (first.status === 'created' && second.status === 'idempotent_replay') {
    assert('SAME order number re-served', first.payload.orderNumber === second.payload.orderNumber);
    assert('same products total re-served', first.payload.productsTotal === second.payload.productsTotal);
    assert('same whatsapp message re-served', first.payload.whatsappMessage === second.payload.whatsappMessage);
  }
  assert('duplicate created NO second order', (await countRows('orders')) === ordersAfterFirst);
  assert('exactly one order carries the key', (await ordersWithKey(idem)) === 1);

  console.log('\n[10] idempotency — CONCURRENT duplicate keys (race)');
  const raceKey = key('idem-race');
  const ordersBeforeRace = await countRows('orders');
  const stockBeforeRace = await stockOf(variantB_default);
  const [a, b, c] = await Promise.all([
    createOrderFromCart(buildRequest({ items: [{ variantId: variantB_default, quantity: 1 }], idem: raceKey })),
    createOrderFromCart(buildRequest({ items: [{ variantId: variantB_default, quantity: 2 }], idem: raceKey })),
    createOrderFromCart(buildRequest({ items: [{ variantId: variantB_default, quantity: 3 }], idem: raceKey })),
  ]);
  const statuses = [a, b, c].map((r) => r.status).sort().join(',');
  assert('all three converge (created once, replays after)', statuses === 'created,idempotent_replay,idempotent_replay', statuses);
  const numbers = new Set([a, b, c].map((r) => (r.status !== 'rejected' ? r.payload.orderNumber : '')));
  assert('all three return the SAME order number', numbers.size === 1);
  assert('exactly one order exists for the racing key', (await ordersWithKey(raceKey)) === 1);
  // ANY of the three can win the race (first writer wins) — the consumed
  // stock must equal the WINNER's quantity, whatever it was.
  const winner = [a, b, c].find((r) => r.status === 'created');
  const winnerQty = winner && winner.status === 'created' ? winner.payload.items[0]!.quantity : 0;
  assert('stock consumed equals the WINNER quantity', stockBeforeRace - (await stockOf(variantB_default)) === winnerQty, `winnerQty=${winnerQty}`);
  assert('orders +1 only', (await countRows('orders')) === ordersBeforeRace + 1);
}

async function suiteConcurrency(): Promise<void> {
  console.log('\n[11] CONCURRENCY — six checkouts fight for stock of 3 (qty 2 each)');
  const stockBefore = 3;
  await db.update(productVariants).set({ stockQuantity: stockBefore }).where(eq(productVariants.id, variantA_L));
  const ordersBefore = await countRows('orders');
  // variantA_L already carries sale movement(s) from earlier sections — the
  // race must add EXACTLY ONE more, so capture the pre-race sale count.
  const salesBeforeRace = (await movementsOf(variantA_L)).filter((m) => m.movementType === 'sale').length;
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
    createOrderFromCart(buildRequest({
      items: [{ variantId: variantA_L, quantity: 2 }],
      idem: key(`race-${i}`),
    }))));
  const created = results.filter((r) => r.status === 'created');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert('exactly ONE checkout wins', created.length === 1, `created=${created.length}`);
  assert('the other five are honestly rejected', rejected.length === 5 && rejected.every((r) => r.status === 'rejected' && r.lineErrors[0]!.reason === 'out_of_stock'));
  const finalStock = await stockOf(variantA_L);
  assert('no oversell: final stock = 1', finalStock === 1, `final=${finalStock}`);
  assert('stock never went negative', finalStock >= 0);
  const movements = await movementsOf(variantA_L);
  const sales = movements.filter((m) => m.movementType === 'sale');
  assert('exactly ONE new sale movement', sales.length === salesBeforeRace + 1, `${salesBeforeRace} → ${sales.length}`);
  const raceSale = sales[sales.length - 1]!;
  assert('movement identity before/after', raceSale.stockBefore === stockBefore && raceSale.stockAfter === 1);
  assert('orders +1 only', (await countRows('orders')) === ordersBefore + 1);
}

async function suiteRollback(): Promise<void> {
  console.log('\n[12] ROLLBACK — forced pre-commit failure leaves zero partial state');
  const ordersBefore = await countRows('orders');
  const itemsBefore = await countRows('order_items');
  const movementsBefore = await countRows('inventory_movements');
  const customersBefore = await countRows('customers');
  const stockBefore = await stockOf(variantA_M);
  const freshPhone = `0121${String(Date.now()).slice(-7)}`;

  let rollbackObserved = false;
  try {
    await createOrderFromCart(buildRequest({
      items: [{ variantId: variantA_M, quantity: 1 }],
      phone: freshPhone,
      idem: key('rollback'),
    }), {
      onBeforeCommit: async () => {
        throw new Error('forced failure before commit (verify-checkout)');
      },
    });
  } catch (error) {
    rollbackObserved = (error as Error).message.includes('forced failure');
  }
  assert('failure propagated out of the service', rollbackObserved);
  assert('NO order survived', (await countRows('orders')) === ordersBefore);
  assert('NO order item survived', (await countRows('order_items')) === itemsBefore);
  assert('NO inventory movement survived', (await countRows('inventory_movements')) === movementsBefore);
  assert('NO customer row survived (upsert rolled back)', (await countRows('customers')) === customersBefore);
  assert('NO stock change survived', (await stockOf(variantA_M)) === stockBefore);
}

async function suiteSnapshotsAndCustomers(): Promise<void> {
  console.log('\n[13] snapshot integrity — later catalog edits never touch history');
  const snapKey = key('snap');
  const snapOutcome = await createOrderFromCart(buildRequest({ items: [{ variantId: variantA_M, quantity: 1 }], idem: snapKey }));
  if (snapOutcome.status !== 'created') {
    fail('snapshot baseline order created');
    return;
  }
  pass('snapshot baseline order created');
  const snapOrder = await db.select({ id: orders.id }).from(orders).where(eq(orders.idempotencyKey, snapKey)).limit(1);
  const orderId = snapOrder[0]!.id;
  const before = (await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)))[0]!;

  // Later edits: rename product, change SKU/prices/stock.
  await db.update(products).set({ name: 'منتج اختبار الدفع أ (معدّل لاحقًا)' }).where(eq(products.id, productA));
  await db.update(productVariants).set({
    sku: `CHK-A-M-EDITED-${Date.now().toString(36)}`,
    originalPrice: '999.00', currentPrice: '888.00', stockQuantity: 99,
  }).where(eq(productVariants.id, variantA_M));

  const after = (await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)))[0]!;
  assert('product name snapshot stable', after.productNameSnapshot === before.productNameSnapshot);
  assert('sku snapshot stable', after.skuSnapshot === before.skuSnapshot);
  assert('original price snapshot stable', after.originalUnitPriceSnapshot === before.originalUnitPriceSnapshot);
  assert('current price snapshot stable', after.currentUnitPriceSnapshot === before.currentUnitPriceSnapshot);
  assert('unit price + subtotal stable', after.unitPrice === before.unitPrice && after.subtotal === before.subtotal);
  assert('attribute snapshot stable', JSON.stringify(after.variantAttributesSnapshot) === JSON.stringify(before.variantAttributesSnapshot));

  console.log('\n[14] customer resolution across display forms');
  const c1 = await db.select().from(customers).where(eq(customers.phoneNormalized, '+201012345678'));
  assert('one customer row for the normalized phone', c1.length === 1);
  const cust2Key = key('cust2');
  await createOrderFromCart(buildRequest({
    phone: '+20 101 234 5678', address: 'الجيزة، الشيخ زايد، الحي الثاني، عمارة 7، الدور 5', idem: cust2Key,
  }));
  const c2 = await db.select().from(customers).where(eq(customers.phoneNormalized, '+201012345678'));
  assert('second order with a different display form reused the SAME customer', c2.length === 1 && c1[0]!.id === c2[0]!.id);
  assert('address_last_used updated to the latest address', c2[0]!.addressLastUsed!.startsWith('الجيزة'));
}

async function suiteGuards(): Promise<void> {
  console.log('\n[15] rate limiter + payload safety');
  const { checkoutRateLimit } = await import('../src/lib/storefront/checkout');
  const rlKey = key('rl');
  let allowed = 0;
  for (let i = 0; i < 15; i += 1) {
    if (checkoutRateLimit(rlKey, 1_000_000)) allowed += 1;
  }
  assert('allows the first 12 attempts, then blocks', allowed === 12, `allowed=${allowed}`);
  assert('window expiry re-allows the SAME key', checkoutRateLimit(rlKey, 1_000_000 + 6 * 60_000));

  const outcome = await createOrderFromCart(buildRequest({ idem: key('payload') }));
  if (outcome.status === 'created') {
    const payloadJson = JSON.stringify(outcome.payload);
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    assert('payload carries NO internal uuid ids', !uuidPattern.test(payloadJson));
    assert('payload keys are exactly the documented shape', JSON.stringify(Object.keys(outcome.payload).sort())
      === JSON.stringify(['items', 'orderNumber', 'paymentMethod', 'productsTotal', 'whatsappMessage', 'whatsappUrl']));
  }
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
console.log(`[verify-checkout] target endpoint (non-secret): ${host}`);

await buildFixtures().catch(async (error) => {
  console.error('[verify-checkout] fixture build failed — cleaning partial fixtures:', (error as Error).message);
  await destroyFixtures().catch(() => undefined);
  process.exit(1);
});

try {
  await suitePure();
  const happyOrderId = await suiteHappyPath();
  await suiteVariantSemantics();
  await suiteTampering();
  await suiteRejections();
  await suiteIdempotency();
  await suiteConcurrency();
  await suiteRollback();
  await suiteSnapshotsAndCustomers();
  await suiteGuards();
  void happyOrderId;
} finally {
  console.log('\n[cleanup] removing probe fixtures + test orders (LIFO)…');
  try {
    await destroyFixtures();
    // Residue check: no probe orders/items/movements/customers remain.
    const residueOrders = await db.select({ n: sql<number>`count(*)::int` }).from(orderItems)
      .where(inArray(orderItems.variantId, [variantA_M, variantA_L, variantB_default, variantB_inactive, variantC_archived].filter(Boolean)));
    assert('cleanup: zero probe order items remain', Number(residueOrders[0]!.n) === 0);
    const residueCustomers = await db.select({ n: sql<number>`count(*)::int` }).from(customers).where(like(customers.name, 'عميل اختبار الدفع%'));
    assert('cleanup: zero probe customers remain', Number(residueCustomers[0]!.n) === 0);
  } catch (cleanupError) {
    failures += 1;
    console.error('[verify-checkout] CLEANUP FAILURE:', (cleanupError as Error)?.message);
  }
  await getPool().end().catch(() => undefined);
}

console.log(`\n[verify-checkout] ${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.error('[verify-checkout] FAILURES PRESENT');
  process.exit(1);
}
console.log('[verify-checkout] ALL CHECKS PASS');
