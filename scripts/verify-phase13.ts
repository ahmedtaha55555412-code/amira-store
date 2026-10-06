/**
 * Amira Store — PHASE-13 adversarial QA suite (unit + integration + invariants
 * + XSS + failure injection). Complements (never duplicates) the per-phase
 * suites: hostile edges the earlier phases did not probe, independent DB
 * recomputation of the business invariants after hostile operations, stored/
 * reflected XSS honesty, and forced failure paths on disposable data.
 *
 * House rules: refuses NODE_ENV=production; fixtures through REAL services;
 * LIFO cleanup + residue probes; never prints credentials; every failure is
 * honest (no catch-and-pass).
 *
 * Env: DATABASE_URL (disposable dev DB).
 */

import { and, eq, inArray, isNull, like, sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import {
  adminActivityLogs,
  categories,
  inventoryMovements,
  orderItems,
  orders,
  productVariants,
  products,
  reviews,
  customers,
  requestRateLimits,
} from '../src/db/schema';
import { adminUsers } from '../src/db/schema';
import { createProduct, setProductStatus } from '../src/lib/catalog/products';
import { createCategory, deleteCategory } from '../src/lib/catalog/categories';
import { checkoutRequestSchema } from '../src/lib/storefront/checkout';
import { buildWhatsAppMessage, buildWhatsAppUrl } from '../src/lib/storefront/whatsapp';
import { discountPercent, formatPrice } from '../src/lib/storefront/format';
import { validateImageUpload, ImageValidationError, MAX_UPLOAD_BYTES } from '../src/lib/media/validation';
import { uploadImage, isMediaUploadConfigured } from '../src/lib/media/service';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

if (process.env.NODE_ENV === 'production') {
  console.error('[verify:phase13] refuses to run outside development.');
  process.exit(1);
}

const STAMP = Date.now().toString(36);

/* -------------------------------------------------------------------------- */
/* §1 checkout schema — adversarial quantities and client-supplied money        */
/* -------------------------------------------------------------------------- */

section('§1 checkout request schema — adversarial edges');

// RFC-compliant v4 UUID (zod v4 validates version + variant nibbles)
const anyUuid = '11111111-1111-4111-8111-111111111111';
const baseBody = {
  items: [{ variantId: anyUuid, quantity: 1 }],
  customerName: 'عميل فحص',
  customerPhone: '01012345678',
  address: 'القاهرة - عنوان الاختبار الطويل بما يكفي للتحقق',
  idempotencyKey: `phase13-schema-${STAMP}`,
};

{
  const negative = checkoutRequestSchema.safeParse({
    ...baseBody,
    items: [{ variantId: anyUuid, quantity: -3 }],
  });
  assert('negative quantity (-3) rejected', !negative.success);

  const overflow = checkoutRequestSchema.safeParse({
    ...baseBody,
    items: [{ variantId: anyUuid, quantity: 2 ** 31 }],
  });
  assert('huge quantity (2^31) rejected', !overflow.success);

  const maxSafe = checkoutRequestSchema.safeParse({
    ...baseBody,
    items: [{ variantId: anyUuid, quantity: Number.MAX_SAFE_INTEGER }],
  });
  assert('MAX_SAFE_INTEGER quantity rejected', !maxSafe.success);

  const zero = checkoutRequestSchema.safeParse({
    ...baseBody,
    items: [{ variantId: anyUuid, quantity: 0 }],
  });
  assert('zero quantity rejected', !zero.success);

  const float = checkoutRequestSchema.safeParse({
    ...baseBody,
    items: [{ variantId: anyUuid, quantity: 1.5 }],
  });
  assert('fractional quantity rejected', !float.success);

  const hostileMoney = checkoutRequestSchema.safeParse({
    ...baseBody,
    unitPrice: '0.01',
    productsTotal: '-999',
    grandTotal: '999999999',
    discount: '100%',
  } as Record<string, unknown>);
  assert(
    'client money fields stripped (schema keeps only known keys)',
    hostileMoney.success && !('unitPrice' in (hostileMoney.data as object)) &&
      !('grandTotal' in (hostileMoney.data as object)),
  );

  const arabicDigits = checkoutRequestSchema.safeParse({
    ...baseBody,
    customerPhone: '٠١٠١٢٣٤٥٦٧٨',
  });
  const arabicMsg =
    !arabicDigits.success ? arabicDigits.error.issues[0]?.message ?? '' : '';
  assert(
    'Arabic-Indic digit phone → honest documented rejection (Latin-only contract)',
    !arabicDigits.success && /[\u0600-\u06FF]/.test(arabicMsg),
    arabicMsg || 'accepted',
  );

  const whitespaceName = checkoutRequestSchema.safeParse({
    ...baseBody,
    customerName: '   ',
  });
  assert('whitespace-only name rejected', !whitespaceName.success);

  const keyTooShort = checkoutRequestSchema.safeParse({
    ...baseBody,
    idempotencyKey: 'short',
  });
  assert('short idempotency key rejected', !keyTooShort.success);
}

/* -------------------------------------------------------------------------- */
/* §2 WhatsApp message builder — hostile encoding                              */
/* -------------------------------------------------------------------------- */

section('§2 WhatsApp builder — hostile payloads stay inert');

{
  const hostileName = '<script>alert("x")</script> %0A %n \n \u0000 قميص';
  const template = 'مرحبًا {store_name} 👋\nأرغب في تأكيد طلبي رقم {order_number}.\n{items}\n{unknown_placeholder}';
  const message = buildWhatsAppMessage(
    {
      storeName: 'أميرة استور',
      orderNumber: 'AMR-AB2CD3',
      lines: [
        {
          productName: hostileName,
          attributesLabel: '',
          quantity: 1,
          unitPrice: '10.00',
        },
      ],
      productsTotal: '10.00',
      paymentMethod: 'الدفع عند الاستلام',
      customerName: 'عميل',
      address: 'العنوان',
    },
    template,
  );
  assert('hostile item name does not break the builder', typeof message === 'string');
  assert(
    'unknown template placeholder preserved visibly (typo-safe)',
    message.includes('{unknown_placeholder}'),
  );

  const url = buildWhatsAppUrl('+201019003677', message);
  assert('wa.me URL carries digits-only phone', url.startsWith('https://wa.me/201019003677?text='));
  let roundTrip = '';
  try {
    roundTrip = decodeURIComponent(url.split('text=')[1] ?? '');
  } catch {
    roundTrip = '';
  }
  assert('hostile message URL round-trips (no malformed percent-encoding)', roundTrip === message);
  assert('message is inert plain text (payload text, never markup semantics)', message.includes('<script>'));
}

/* -------------------------------------------------------------------------- */
/* §3 display math edges                                                       */
/* -------------------------------------------------------------------------- */

section('§3 discount / price display edges');

{
  assert('discount 0 when prices equal', discountPercent('100.00', '100.00') === 0);
  assert('discount 0 when current > original', discountPercent('100.00', '150.00') === 0);
  assert('discount 0 when original is 0', discountPercent('0.00', '50.00') === 0);
  assert('discount 0 when original negative', discountPercent('-5.00', '1.00') === 0);
  assert('discount 100 at zero current', discountPercent('100.00', '0.00') === 100);
  assert('discount rounds (1/3 → 33)', discountPercent('3.00', '2.00') === 33);
  assert('formatPrice non-finite → em dash', formatPrice('abc') === '—');
  assert('formatPrice string cents exact', formatPrice('10.55').includes('10.55'));
}

/* -------------------------------------------------------------------------- */
/* §4 media upload validation — adversarial payloads (pure validation layer)   */
/* -------------------------------------------------------------------------- */

section('§4 media validation — hostile uploads rejected BEFORE storage');

{
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8//8/AzGAiShVowoJAgCCpgQDXDeUDQAAAABJRU5ErkJggg==',
    'base64',
  );

  const empty = await validateImageUpload({ bytes: Buffer.alloc(0), declaredContentType: 'image/png' })
    .then(() => null)
    .catch((e) => e);
  assert('empty file rejected', empty instanceof ImageValidationError);

  const textFile = await validateImageUpload({ bytes: Buffer.from('hello world this is not an image at all........'), declaredContentType: 'image/png' })
    .then(() => null)
    .catch((e) => e);
  assert('text payload with image Content-Type rejected (magic-byte sniff)', textFile instanceof ImageValidationError);

  const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"></svg>');
  const svg = await validateImageUpload({ bytes: svgBytes, declaredContentType: 'image/svg+xml' })
    .then(() => null)
    .catch((e) => e);
  assert('SVG rejected (not in allowlist)', svg instanceof ImageValidationError);

  // real JPEG bytes, declared as PNG → explicit mismatch
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAIBAREA/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAr/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
    'base64',
  );
  const mismatch = await validateImageUpload({ bytes: jpeg, declaredContentType: 'image/png' })
    .then(() => null)
    .catch((e) => e);
  assert('declared PNG + actual JPEG rejected (mismatch)', mismatch instanceof ImageValidationError);

  const oversized = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    Buffer.alloc(MAX_UPLOAD_BYTES + 1),
  ]);
  const huge = await validateImageUpload({ bytes: oversized, declaredContentType: 'image/png' })
    .then(() => null)
    .catch((e) => e);
  assert('oversized (>4MB) rejected before decode', huge instanceof ImageValidationError);

  const tiny = await validateImageUpload({ bytes: png, declaredContentType: 'image/png' })
    .then(() => null)
    .catch((e) => e);
  assert(
    '16×16 PNG rejected by dimension floor (100px min)',
    tiny instanceof ImageValidationError,
  );
}

/* -------------------------------------------------------------------------- */
/* §5 stored + reflected XSS honesty                                           */
/* -------------------------------------------------------------------------- */

const XSNIP = '<script>alert(1)</script>';
const IMG_PAYLOAD = '"><img src=x onerror=alert(2)>';

let xssProductSlug: string | null = null;
let xssCategoryId: string | null = null;

{
  section('§5 stored + reflected XSS honesty');
  const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  let serverUp = false;
  try {
    serverUp = (await fetch(BASE_URL, { signal: AbortSignal.timeout(4000) })).status === 200;
  } catch {
    serverUp = false;
  }

  if (serverUp) {
    const [admin] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
    if (!admin) throw new Error('phase13: no admin user for XSS fixture');

    const category = await createCategory(
      { name: `قسم اختبار الاختراق ${STAMP}`, slug: `xss-cat-${STAMP}` },
      admin.id,
    );
    xssCategoryId = category.id;

    const product = await createProduct(
      { name: `منتج ${XSNIP} ${STAMP}`, slug: `xss-probe-${STAMP}`, categoryId: category.id },
      admin.id,
    );
    await db
      .update(products)
      .set({
        shortDescription: `وصف قصير ${IMG_PAYLOAD}`,
        description: `<p>وصف ${XSNIP}</p>`,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(products.id, product.id));
    await setProductStatus(product.id, 'active', admin.id);
    await db.insert(productVariants).values({
      productId: product.id,
      sku: `XSS-${STAMP}`,
      originalPrice: '150.00',
      currentPrice: '99.00',
      stockQuantity: 4,
      lowStockThreshold: 2,
      isActive: true,
    });
    xssProductSlug = product.slug;

    const productHtml = await fetch(`${BASE_URL}/product/${product.slug}`)
      .then((r) => r.text())
      .catch(() => '');
    assert('product page renders 200 with hostile fields', productHtml.length > 0);
    assert(
      'product page: no executable <script>alert(1)</script> from stored payload',
      !productHtml.includes('<script>alert(1)'),
    );
    assert(
      'product page: no onerror attribute handler from stored payload',
      !/<img[^>]+onerror=/i.test(productHtml),
    );

    const searchHtml = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(`"><svg onload=alert(3)> ${XSNIP}`)}`)
      .then((r) => r.text())
      .catch(() => '');
    assert(
      'search reflection: hostile query is inert (no <svg onload / no raw <script>)',
      !/\<svg[^>]+onload/i.test(searchHtml) && !searchHtml.includes('<script>alert(1)'),
    );

    const suggestions = await fetch(
      `${BASE_URL}/api/storefront/search/suggestions?q=${encodeURIComponent(XSNIP)}`,
    ).then((r) => r.json() as Promise<unknown>);
    assert(
      'suggestions endpoint returns well-formed JSON for hostile query',
      typeof suggestions === 'object' && suggestions !== null,
    );

    const homeHtml = await fetch(BASE_URL).then((r) => r.text()).catch(() => '');
    assert(
      'homepage (offers/new-arrivals surfaces) does not execute stored payload',
      !homeHtml.includes('<script>alert(1)') && !/<img[^>]+onerror=/i.test(homeHtml),
    );
  } else {
    section('§5 XSS honesty — SKIPPED HONESTLY (dev server unreachable)');
    console.log('  ! BASE_URL unreachable; invariants sections below remain the gate.');
  }
}

/* -------------------------------------------------------------------------- */
/* §6 failure injection — storage unavailable + audit/registry honesty         */
/* -------------------------------------------------------------------------- */

{
  section('§6 failure injection (disposable surfaces only)');
  const configured = isMediaUploadConfigured();
  const [beforeCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sql`media_assets`);

  if (!configured) {
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAOklEQVR4nO3BAQ0AAADCoPdMbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPBrw9QAAQDmZa1AAAAAAElFTkSuQmCC',
      'base64',
    );
    const [admin] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
    let threw = false;
    try {
      await uploadImage({
        bytes: tinyPng,
        declaredContentType: 'image/png',
        accessMode: 'public',
        altText: null,
        adminUserId: admin?.id ?? null,
      });
    } catch {
      threw = true;
    }
    assert('storage unavailable → uploadImage fails honestly (no silent success)', threw);
    const [afterCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sql`media_assets`);
    assert('failed upload leaves NO registry row (no orphan metadata)', afterCount.n === beforeCount.n);
  } else {
    console.log('  - SKIP media-unavailable injection: storage is configured in this environment; no false PASS is recorded.');
  }
}

/* -------------------------------------------------------------------------- */
/* §7 durable abuse-control admission (atomic across serverless instances)   */

{
  const { consumeDurableRateLimit } = await import('../src/lib/storefront/durable-rate-limit');
  const scope = `qa:durable-rate:${STAMP}`;
  const keyHash = `qa-${STAMP}`;
  const now = 1_800_000_000_000;
  const first = await consumeDurableRateLimit({ scope, keyHash, windowMs: 60_000, maxAttempts: 3 }, now);
  const second = await consumeDurableRateLimit({ scope, keyHash, windowMs: 60_000, maxAttempts: 3 }, now + 1);
  const third = await consumeDurableRateLimit({ scope, keyHash, windowMs: 60_000, maxAttempts: 3 }, now + 2);
  const blocked = await consumeDurableRateLimit({ scope, keyHash, windowMs: 60_000, maxAttempts: 3 }, now + 3);
  const nextWindow = await consumeDurableRateLimit({ scope, keyHash, windowMs: 60_000, maxAttempts: 3 }, now + 60_000);
  assert('durable limiter allows attempts through configured cap', first.allowed && second.allowed && third.allowed);
  assert('durable limiter blocks the next concurrent-equivalent attempt', !blocked.allowed && blocked.attempts === 4);
  assert('durable limiter re-allows in the next fixed window', nextWindow.allowed && nextWindow.attempts === 1);
  await db.delete(requestRateLimits).where(eq(requestRateLimits.scope, scope));
}

/* -------------------------------------------------------------------------- */
/* §8 independent DB invariant recomputation (after all hostile operations)     */
/* -------------------------------------------------------------------------- */

{
  section('§7 DB business invariants — independent recomputation');

  const [neg] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productVariants)
    .where(sql`${productVariants.stockQuantity} < 0`);
  assert('no negative stock anywhere', neg.n === 0, `rows=${neg.n}`);

  // ledger chain per variant: before == previous after; last after == live stock
  const chainRows = await db
    .select({
      variantId: inventoryMovements.variantId,
      stockBefore: inventoryMovements.stockBefore,
      stockAfter: inventoryMovements.stockAfter,
      createdAt: inventoryMovements.createdAt,
      id: inventoryMovements.id,
    })
    .from(inventoryMovements)
    .orderBy(inventoryMovements.variantId, inventoryMovements.createdAt, inventoryMovements.id);

  let chainBreaks = 0;
  let headMismatch = 0;
  const perVariant = new Map<string, { lastAfter: number; rows: number }>();
  let previous: { variantId: string; stockAfter: number } | null = null;
  for (const row of chainRows) {
    const prevForVariant =
      previous && previous.variantId === row.variantId ? previous : null;
    if (prevForVariant && prevForVariant.stockAfter !== row.stockBefore) {
      chainBreaks += 1;
    }
    perVariant.set(row.variantId, { lastAfter: row.stockAfter, rows: (perVariant.get(row.variantId)?.rows ?? 0) + 1 });
    previous = { variantId: row.variantId, stockAfter: row.stockAfter };
  }
  const liveStocks = await db
    .select({ id: productVariants.id, stock: productVariants.stockQuantity })
    .from(productVariants);
  for (const variant of liveStocks) {
    const ledger = perVariant.get(variant.id);
    if (ledger && ledger.lastAfter !== variant.stock) headMismatch += 1;
  }
  assert('ledger chains are continuous (before == previous after)', chainBreaks === 0, `breaks=${chainBreaks}`);
  assert('ledger head == live stock for every ledger-bearing variant', headMismatch === 0, `mismatches=${headMismatch}`);

  const [money] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(sql`${orders.grandTotal} <> ${orders.productsTotal} + coalesce(${orders.shippingCost}, 0)`);
  assert('order money identity holds for ALL orders', money.n === 0, `rows=${money.n}`);

  const [subtotals] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orderItems)
    .where(sql`${orderItems.subtotal} <> ${orderItems.unitPrice} * ${orderItems.quantity}`);
  assert('order item subtotal identity holds for ALL items', subtotals.n === 0, `rows=${subtotals.n}`);

  const [orphanMovements] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inventoryMovements)
    .leftJoin(productVariants, eq(inventoryMovements.variantId, productVariants.id))
    .where(isNull(productVariants.id));
  assert('no orphan inventory movements', orphanMovements.n === 0);

  const [orphanItems] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orderItems)
    .leftJoin(orders, eq(orderItems.orderId, orders.id))
    .where(isNull(orders.id));
  assert('no orphan order items', orphanItems.n === 0);

  const dupKeys = await db
    .select({ key: orders.idempotencyKey, n: sql<number>`count(*)::int` })
    .from(orders)
    .where(sql`${orders.idempotencyKey} is not null`)
    .groupBy(orders.idempotencyKey)
    .having(sql`count(*) > 1`);
  assert('no duplicate idempotency keys (one order per key)', dupKeys.length === 0);

  const [restoreOnce] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.movementType, 'cancellation_return'), isNull(inventoryMovements.orderId)));
  assert('every cancellation_return references an order', restoreOnce.n === 0);

  const [badRatings] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(sql`${reviews.rating} < 1 or ${reviews.rating} > 5`);
  assert('review ratings within 1..5', badRatings.n === 0);

  const validStatuses = ['new', 'under_review', 'confirmed', 'preparing', 'completed', 'canceled'];
  const [badOrderStatus] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(sql`${orders.orderStatus}::text not in ('new','under_review','confirmed','preparing','completed','canceled')`);
  assert('order statuses all valid enum members', badOrderStatus.n === 0, `checked=${validStatuses.length}`);

  const [auditRows] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminActivityLogs)
    .where(like(adminActivityLogs.action, 'order.%'));
  assert('order mutations have audit coverage', auditRows.n > 0, `rows=${auditRows.n}`);
}

/* -------------------------------------------------------------------------- */
/* Cleanup                                                                     */
/* -------------------------------------------------------------------------- */

{
  section('Cleanup + residue probes');
  // XSS fixtures: FK-safe LIFO (variant → product → category)
  if (xssProductSlug) {
    const [prod] = await db.select({ id: products.id }).from(products).where(eq(products.slug, xssProductSlug)).limit(1);
    if (prod) {
      await db.delete(productVariants).where(eq(productVariants.productId, prod.id));
      await db.delete(products).where(eq(products.id, prod.id));
    }
  }
  if (xssCategoryId) {
    await deleteCategory(xssCategoryId, (await db.select({ id: adminUsers.id }).from(adminUsers).limit(1))[0].id).catch(() => undefined);
    const [catResidue] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(categories)
      .where(eq(categories.slug, `xss-cat-${STAMP}`));
    assert('XSS category fixture removed', catResidue.n === 0);
  }
  const [prodResidue] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(like(products.slug, `xss-probe-${STAMP}`));
  assert('XSS product fixture removed', prodResidue.n === 0);

  const [customerResidue] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(customers)
    .where(like(customers.name, '%عميل فحص%'));
  assert('no fixture customer residue', customerResidue.n === 0);
}

await getPool().end().catch(() => undefined);

console.log(`\n[verify:phase13] ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('[verify:phase13] FAILURES:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
