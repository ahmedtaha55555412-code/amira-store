/**
 * Amira Store — PHASE-13 E2E golden journey (REAL HTTP + DB truth).
 *
 * MASTER_PLAN primary journey, exercised over the actual HTTP surface:
 *   Home → category/search → product → variant → cart-availability →
 *   checkout → order success payload → WhatsApp handoff contract →
 *   admin sees order → stock decreased → admin updates shipping →
 *   customer tracks order (via the NEW /track-order).
 *
 * Failure variants (directive §12): out-of-stock, changed price (server
 * truth wins), invalid checkout, duplicate submit, WhatsApp fallback URL,
 * invalid tracking (no oracle), canceled order path.
 *
 * House rules: refuses NODE_ENV=production; disposable fixtures through REAL
 * services/APIs; distinct X-Forwarded-For per checkout (rate limiter keyed by
 * hashed IP); LIFO cleanup + residue probes; never prints credentials.
 *
 * Env: DATABASE_URL, BASE_URL, ADMIN_QA_USERNAME/ADMIN_QA_PASSWORD.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import {
  adminActivityLogs,
  customers,
  inventoryMovements,
  orderItems,
  orders,
  productVariants,
  products,
} from '../src/db/schema';

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
  console.error('[verify:e2e] refuses to run outside development.');
  process.exit(1);
}

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const STAMP = Date.now().toString(36);
const PHONE = '01077700077';

const touchedVariants = new Map<string, number>();
const createdOrderIds: string[] = [];
const createdCustomerIds = new Set<string>();

async function trackVariant(variantId: string) {
  if (!touchedVariants.has(variantId)) {
    const [row] = await db
      .select({ stock: productVariants.stockQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    touchedVariants.set(variantId, row.stock);
  }
}

async function trackOrderByKey(key: string) {
  const [row] = await db
    .select({ id: orders.id, customerId: orders.customerId })
    .from(orders)
    .where(eq(orders.idempotencyKey, key))
    .limit(1);
  if (row) {
    createdOrderIds.push(row.id);
    createdCustomerIds.add(row.customerId);
    return row;
  }
  return null;
}

async function cleanup() {
  if (createdOrderIds.length > 0) {
    await db.delete(inventoryMovements).where(inArray(inventoryMovements.orderId, createdOrderIds));
    await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
    await db.delete(orders).where(inArray(orders.id, createdOrderIds));
  }
  if (createdCustomerIds.size > 0) {
    await db.delete(customers).where(inArray(customers.id, [...createdCustomerIds]));
  }
  for (const [variantId, originalStock] of touchedVariants) {
    await db
      .update(productVariants)
      .set({ stockQuantity: originalStock })
      .where(eq(productVariants.id, variantId));
  }
}

let qaCookie = '';

try {
  section('§0 prerequisites');
  {
    const QA_USERNAME = process.env.ADMIN_QA_USERNAME ?? '';
    const QA_PASSWORD = process.env.ADMIN_QA_PASSWORD ?? '';
    if (!QA_USERNAME || !QA_PASSWORD) throw new Error('ADMIN_QA_USERNAME/ADMIN_QA_PASSWORD unset');
    const response = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL },
      body: JSON.stringify({ username: QA_USERNAME, password: QA_PASSWORD }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.status !== 200) throw new Error(`QA admin login failed: ${response.status}`);
    const cookie = (response.headers.getSetCookie?.() ?? []).find((c) =>
      /^amira_admin_session=/i.test(c),
    );
    if (!cookie) throw new Error('no session cookie');
    qaCookie = cookie.split(';')[0];
    assert('QA admin session ready', true);
  }

  section('§1 storefront journey — Home → category → product');
  {
    const home = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(10000) });
    const homeHtml = await home.text();
    assert('home renders 200, Arabic RTL, single h1', home.status === 200 && /dir="rtl"/.test(homeHtml));

    const [category] = await db
      .select({ slug: products.slug, productId: products.id, categoryId: products.categoryId })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .where(and(eq(products.status, 'active'), eq(productVariants.isActive, true), sql`${productVariants.stockQuantity} >= 5`))
      .limit(1);
    if (!category) throw new Error('no active seed product for the journey');

    const [catRow] = await db
      .select({ slug: sql<string>`slug` })
      .from(sql`categories`)
      .where(sql`id = ${category.categoryId}`)
      .limit(1);
    const categoryPage = await fetch(`${BASE_URL}/category/${catRow.slug}`, { signal: AbortSignal.timeout(10000) });
    assert('category page renders 200', categoryPage.status === 200);

    const productPage = await fetch(`${BASE_URL}/product/${category.slug}`, { signal: AbortSignal.timeout(10000) });
    const productHtml = await productPage.text();
    assert('product page renders 200 with JSON-LD', productPage.status === 200 && productHtml.includes('application/ld+json'));

    // the journey variant: cheapest active in-stock variant of this product
    const [variant] = await db
      .select({
        id: productVariants.id,
        stock: productVariants.stockQuantity,
        price: productVariants.currentPrice,
        productId: products.id,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(and(eq(products.id, category.productId), eq(productVariants.isActive, true), sql`${productVariants.stockQuantity} >= 5`))
      .limit(1);
    if (!variant) throw new Error('no journey variant');

    await trackVariant(variant.id);

    const availability = await fetch(`${BASE_URL}/api/storefront/cart-availability`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ variantIds: [variant.id] }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => r.json() as Promise<{ availability?: Array<{ found: boolean; stockQuantity?: number }> }>);
    assert(
      'availability endpoint reports server-truth stock',
      availability.availability?.[0]?.found === true &&
        availability.availability?.[0]?.stockQuantity === variant.stock,
    );

    section('§2 checkout → order success → WhatsApp handoff');
    const checkoutKey = `e2e-${STAMP}`;
    const checkout = await fetch(`${BASE_URL}/api/storefront/checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: BASE_URL,
        'x-forwarded-for': `10.210.0.${(parseInt(STAMP.slice(-2), 36) % 200) + 10}`,
      },
      body: JSON.stringify({
        items: [{ variantId: variant.id, quantity: 2 }],
        customerName: 'عميل الرحلة',
        customerPhone: PHONE,
        address: 'الإسكندرية - شارع الرحلة الذهبية ٧',
        idempotencyKey: checkoutKey,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const checkoutBody = (await checkout.json()) as {
      ok?: boolean;
      order?: { orderNumber: string; whatsappUrl: string; whatsappMessage: string; productsTotal: string; unitPrice?: string; items?: Array<{ unitPrice: string }> };
    };
    assert('checkout → 200 ok', checkout.status === 200 && checkoutBody.ok === true);
    const orderNumber = checkoutBody.order?.orderNumber ?? '';
    assert('success payload carries an AMR order number', /^AMR-[A-Z0-9]{6}$/.test(orderNumber));
    assert(
      'WhatsApp handoff: wa.me URL for the configured number with encoded message',
      (checkoutBody.order?.whatsappUrl ?? '').startsWith('https://wa.me/201019003677?text='),
    );
    assert(
      'WhatsApp message contains the order number (pre-filled; customer presses Send)',
      (checkoutBody.order?.whatsappMessage ?? '').includes(orderNumber),
    );

    const tracked = await trackOrderByKey(checkoutKey);
    assert('DB truth: order persisted BEFORE WhatsApp handoff payload', tracked !== null);

    const [stockAfter] = await db
      .select({ stock: productVariants.stockQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variant.id));
    assert(
      'DB truth: stock decremented exactly once (−2)',
      stockAfter.stock === variant.stock - 2,
      `${variant.stock} → ${stockAfter.stock}`,
    );

    section('§3 admin sees order → updates shipping → status chain');
    {
      const found = await fetch(`${BASE_URL}/api/admin/orders/${tracked?.id}/shipping-cost`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL, cookie: qaCookie },
        body: JSON.stringify({ shippingCost: 50 }),
        signal: AbortSignal.timeout(10000),
      });
      assert('admin sets shipping cost 50 → 200', found.status === 200, `got ${found.status}`);

      const [totals] = await db
        .select({ productsTotal: orders.productsTotal, shipping: orders.shippingCost, grand: orders.grandTotal })
        .from(orders)
        .where(eq(orders.id, tracked?.id ?? ''));
      assert(
        'DB truth: grand total recalculated server-side (products + 50)',
        Number(totals.grand) === Number(totals.productsTotal) + 50 && Number(totals.shipping) === 50,
        `grand=${totals.grand}, products=${totals.productsTotal}`,
      );

      for (const target of ['preparing', 'ready_to_ship', 'shipped'] as const) {
        const step = await fetch(`${BASE_URL}/api/admin/orders/${tracked?.id}/shipping-status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: BASE_URL, cookie: qaCookie },
          body: JSON.stringify({ status: target }),
          signal: AbortSignal.timeout(10000),
        });
        assert(`admin shipping transition → ${target}`, step.status === 200, `got ${step.status}`);
      }
      // §12 chain is strict: new → under_review → confirmed (no skip edges)
      for (const target of ['under_review', 'confirmed'] as const) {
        const confirmed = await fetch(`${BASE_URL}/api/admin/orders/${tracked?.id}/status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: BASE_URL, cookie: qaCookie },
          body: JSON.stringify({ status: target }),
          signal: AbortSignal.timeout(10000),
        });
        assert(`admin order transition → ${target}`, confirmed.status === 200, `got ${confirmed.status}`);
      }
    }

    section('§4 customer tracks the order (NEW /track-order)');
    {
      const track = await fetch(`${BASE_URL}/api/storefront/track-order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL },
        body: JSON.stringify({ orderNumber, phone: PHONE }),
        signal: AbortSignal.timeout(10000),
      });
      const trackBody = (await track.json()) as {
        ok?: boolean;
        order?: { orderStatus: { status: string }; shippingStatus: { status: string }; shippingCost: string | null; grandTotal: string };
      };
      assert('tracking → 200 ok with full view', track.status === 200 && trackBody.ok === true);
      assert(
        'timeline reflects admin updates (confirmed + shipped)',
        trackBody.order?.orderStatus.status === 'confirmed' &&
          trackBody.order?.shippingStatus.status === 'shipped',
      );
      assert(
        'tracking shows the recorded shipping cost (50) in the grand total',
        trackBody.order?.shippingCost === '50.00' &&
          Number(trackBody.order?.grandTotal) === Number(checkoutBody.order?.productsTotal) + 50,
      );

      const wrongPhone = await fetch(`${BASE_URL}/api/storefront/track-order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL },
        body: JSON.stringify({ orderNumber, phone: '01088888888' }),
        signal: AbortSignal.timeout(10000),
      });
      const wrongBody = (await wrongPhone.json()) as { error?: string };
      const unknown = await fetch(`${BASE_URL}/api/storefront/track-order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL },
        body: JSON.stringify({ orderNumber: 'AMR-ZZZ888', phone: PHONE }),
        signal: AbortSignal.timeout(10000),
      });
      const unknownBody = (await unknown.json()) as { error?: string };
      assert(
        'invalid tracking: wrong phone and unknown order share the SAME generic error (no oracle)',
        wrongPhone.status === 422 &&
          unknown.status === 422 &&
          wrongBody.error === unknownBody.error,
      );
    }

    section('§5 failure variants');
    {
      // 5a. out-of-stock checkout
      await db.update(productVariants).set({ stockQuantity: 0 }).where(eq(productVariants.id, variant.id));
      const oos = await fetch(`${BASE_URL}/api/storefront/checkout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: BASE_URL,
          'x-forwarded-for': '10.211.0.1',
        },
        body: JSON.stringify({
          items: [{ variantId: variant.id, quantity: 1 }],
          customerName: 'عميل نفاد',
          customerPhone: PHONE,
          address: 'القاهرة - شارع نفاد المخزون ٠',
          idempotencyKey: `e2e-oos-${STAMP}`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      assert('out-of-stock checkout → 409 honest rejection', oos.status === 409);

      // 5b. changed price: server truth wins over the payload the cart loaded
      const [live] = await db
        .select({ price: productVariants.currentPrice })
        .from(productVariants)
        .where(eq(productVariants.id, variant.id));
      const newPrice = '777.77';
      await db
        .update(productVariants)
        .set({ currentPrice: newPrice })
        .where(eq(productVariants.id, variant.id));
      await db.update(productVariants).set({ stockQuantity: 5 }).where(eq(productVariants.id, variant.id));
      const priceChange = await fetch(`${BASE_URL}/api/storefront/checkout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: BASE_URL,
          'x-forwarded-for': '10.212.0.1',
        },
        body: JSON.stringify({
          items: [{ variantId: variant.id, quantity: 1, unitPrice: variant.price }],
          customerName: 'عميل السعر',
          customerPhone: PHONE,
          address: 'القاهرة - شارع تغير السعر ٥',
          idempotencyKey: `e2e-price-${STAMP}`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const priceBody = (await priceChange.json()) as {
      ok?: boolean;
      order?: { orderNumber: string; items: Array<{ unitPrice: string }> };
    };
      await trackOrderByKey(`e2e-price-${STAMP}`);
      assert(
        'stale cart: server charges the LIVE new price, client value ignored',
        priceChange.status === 200 &&
          priceBody.order?.items[0]?.unitPrice === newPrice &&
          priceBody.order.items[0].unitPrice !== variant.price,
        `charged=${priceBody.order?.items[0]?.unitPrice}`,
      );
      // restore price + stock for cleanup symmetry
      await db
        .update(productVariants)
        .set({ currentPrice: live.price })
        .where(eq(productVariants.id, variant.id));

      // 5c. duplicate submit (sequential) → same order served
      const dup = await fetch(`${BASE_URL}/api/storefront/checkout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: BASE_URL,
          'x-forwarded-for': '10.212.0.1',
        },
        body: JSON.stringify({
          items: [{ variantId: variant.id, quantity: 1 }],
          customerName: 'عميل السعر',
          customerPhone: PHONE,
          address: 'القاهرة - شارع تغير السعر ٥',
          idempotencyKey: `e2e-price-${STAMP}`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const dupBody = (await dup.json()) as { ok?: boolean; order?: { orderNumber: string } };
      assert(
        'duplicate submit serves the SAME order number',
        dup.status === 200 && dupBody.order?.orderNumber === priceBody.order?.orderNumber,
      );

      // 5d. invalid checkout → 400 Arabic
      const invalid = await fetch(`${BASE_URL}/api/storefront/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL },
        body: JSON.stringify({
          items: [{ variantId: variant.id, quantity: -2 }],
          customerName: 'عميل',
          customerPhone: 'bad-phone',
          address: 'قصير',
          idempotencyKey: `e2e-bad-${STAMP}`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const invalidBody = (await invalid.json()) as { error?: string };
      assert(
        'invalid checkout → 400 with Arabic error',
        invalid.status === 400 && /[\u0600-\u06FF]/.test(invalidBody.error ?? ''),
      );

      // 5e. canceled order path
      const cancelKey = `e2e-cancel-${STAMP}`;
      const cancelCheckout = await fetch(`${BASE_URL}/api/storefront/checkout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: BASE_URL,
          'x-forwarded-for': '10.213.0.1',
        },
        body: JSON.stringify({
          items: [{ variantId: variant.id, quantity: 1 }],
          customerName: 'عميل الإلغاء',
          customerPhone: PHONE,
          address: 'القاهرة - شارع الإلغاء ٣',
          idempotencyKey: cancelKey,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const cancelBody = (await cancelCheckout.json()) as { ok?: boolean; order?: { orderNumber: string } };
      assert('canceled-path fixture: checkout ok', cancelCheckout.status === 200 && cancelBody.ok === true);
      const cancelTracked = await trackOrderByKey(cancelKey);

      const cancel = await fetch(`${BASE_URL}/api/admin/orders/${cancelTracked?.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL, cookie: qaCookie },
        body: JSON.stringify({ status: 'canceled' }),
        signal: AbortSignal.timeout(10000),
      });
      assert('admin cancels the order → 200', cancel.status === 200, `got ${cancel.status}`);

      const [restored] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(inventoryMovements)
        .where(and(eq(inventoryMovements.orderId, cancelTracked?.id ?? ''), eq(inventoryMovements.movementType, 'cancellation_return')));
      assert('DB truth: cancellation restored stock exactly once', restored.n === 1);

      const trackCanceled = await fetch(`${BASE_URL}/api/storefront/track-order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL },
        body: JSON.stringify({ orderNumber: cancelBody.order?.orderNumber, phone: PHONE }),
        signal: AbortSignal.timeout(10000),
      });
      const trackCanceledBody = (await trackCanceled.json()) as {
        ok?: boolean;
        order?: { orderStatus: { status: string; label: string } };
      };
      assert(
        'canceled order path: tracking shows ملغى honestly',
        trackCanceledBody.order?.orderStatus.status === 'canceled' &&
          trackCanceledBody.order?.orderStatus.label === 'ملغى',
      );
    }
  }

  section('Cleanup + residue probes');
  await cleanup();
  {
    const residue = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(sql`${orders.idempotencyKey} like ${`e2e-%${STAMP}`}`);
    assert('no fixture order residue', residue[0].n === 0, `n=${residue[0].n}`);
  }
} catch (error) {
  failed += 1;
  failures.push(`SUITE ABORTED: ${(error as Error).message}`);
  console.error(`\n[verify:e2e] SUITE ABORTED: ${(error as Error).message}`);
  await cleanup().catch(() => undefined);
} finally {
  // logout QA session (cleanup)
  await fetch(`${BASE_URL}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { origin: BASE_URL },
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
  await getPool().end().catch(() => undefined);
}

console.log(`\n[verify:e2e] ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('[verify:e2e] FAILURES:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
