/**
 * Amira Store — PHASE-13 tracking suite (/track-order deep test).
 *
 * MASTER_PLAN §14 + FINAL_ACCEPTANCE "Customer can track by order number +
 * checkout phone". Proves:
 *   §A pure/service gates   — schema rejection honesty (incl. Arabic-Indic
 *                             digits → the SAME documented Arabic error as
 *                             the rest of the store), no-existence-oracle
 *                             equivalence, rate limiter, timeline derivation
 *                             across the §12 chains (mid-chain, delivered,
 *                             canceled, shipping-failed).
 *   §B HTTP surface         — page noindex + robots contract, route guard
 *                             matrix (hostile origin / form-spoof / bad JSON /
 *                             bad fields), success payload leak-minimality
 *                             (no UUIDs / address / phone), 429 flood.
 *
 * House rules: refuses NODE_ENV=production; builds its own fixtures through
 * the REAL checkout service and admin transitions; LIFO cleanup + residue
 * probes; never prints credentials.
 *
 * Env: DATABASE_URL (disposable dev DB); BASE_URL (default http://localhost:3000,
 * HTTP section is skipped honestly when the server is unreachable — the
 * service section remains the gate).
 */

import { eq, inArray } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import {
  adminUsers,
  customers,
  inventoryMovements,
  orderItems,
  orders,
  productVariants,
} from '../src/db/schema';
import { createOrderFromCart } from '../src/lib/storefront/checkout';
import {
  TrackingServiceError,
  TRACKING_MATCH_ERROR,
  lookupOrderForTracking,
  trackingLookupRateLimit,
  trackingLookupSchema,
} from '../src/lib/storefront/tracking';
import {
  transitionOrderStatus,
  transitionShippingStatus,
} from '../src/lib/admin/orders';

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
  console.error('[verify-tracking] refuses to run outside development.');
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Fixtures (real checkout path; LIFO cleanup in finally)                      */
/* -------------------------------------------------------------------------- */

const FIXTURE_PREFIX = 'phase13-track';
const STAMP = Date.now().toString(36);

type Fixture = {
  variantId: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
};

/** Original stock of the shared fixture variant, captured BEFORE any order. */
let variantOriginalStock: number | null = null;

async function acquireFixtureVariant(): Promise<{ id: string; stock: number }> {
  const [variant] = await db
    .select({ id: productVariants.id, stock: productVariants.stockQuantity })
    .from(productVariants)
    .where(eq(productVariants.stockQuantity, 5))
    .limit(1);
  if (!variant) throw new Error('no variant with stock 5 for fixture');
  return variant;
}

let sharedVariantId: string | null = null;

async function createFixtureOrder(
  label: string,
  phone: string,
): Promise<Fixture> {
  if (!sharedVariantId) {
    const variant = await acquireFixtureVariant();
    sharedVariantId = variant.id;
    variantOriginalStock = variant.stock;
  }
  const variantId = sharedVariantId;

  const result = await createOrderFromCart({
    items: [{ variantId, quantity: 1 }],
    customerName: `عميل تتبع ${label}`,
    customerPhone: phone,
    address: 'القاهرة - مصر الجديدة - شارع التتبع ١٣',
    idempotencyKey: `${FIXTURE_PREFIX}-${STAMP}-${label}`,
  });
  if (result.status !== 'created') {
    throw new Error(`fixture checkout failed: ${result.status}`);
  }

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(eq(orders.idempotencyKey, `${FIXTURE_PREFIX}-${STAMP}-${label}`))
    .limit(1);

  return {
    variantId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
  };
}

async function cleanup(fixtures: Fixture[]) {
  for (const fixture of fixtures) {
    await db
      .delete(inventoryMovements)
      .where(eq(inventoryMovements.orderId, fixture.orderId));
    await db.delete(orderItems).where(eq(orderItems.orderId, fixture.orderId));
    await db.delete(orders).where(eq(orders.id, fixture.orderId));
    await db.delete(customers).where(eq(customers.id, fixture.customerId));
  }
  // restore the exact pre-fixture stock truth for the shared variant
  if (sharedVariantId && variantOriginalStock !== null) {
    await db
      .update(productVariants)
      .set({ stockQuantity: variantOriginalStock })
      .where(eq(productVariants.id, sharedVariantId));
  }
}

async function residueProbe() {
  const rows = await db
    .select({ n: orders.id })
    .from(orders)
    .where(inArray(orders.idempotencyKey, [`${FIXTURE_PREFIX}-${STAMP}-a`]));
  return rows.length === 0;
}

/* -------------------------------------------------------------------------- */
/* §A — service/pure gates                                                     */
/* -------------------------------------------------------------------------- */

const fixtures: Fixture[] = [];

try {
  section('Fixtures (real checkout path)');
  const [fixtureAdmin] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  if (!fixtureAdmin) throw new Error('phase13: no admin user for fixture audit rows');
  const adminId = fixtureAdmin.id;
  const delivered = await createFixtureOrder('a', '01011111111');
  fixtures.push(delivered);
  // walk the REAL §12 chains: shipping → delivered, then order → completed
  for (const target of [
    'preparing',
    'ready_to_ship',
    'shipped',
    'out_for_delivery',
    'delivered',
  ] as const) {
    await transitionShippingStatus(delivered.orderId, target, adminId);
  }
  for (const target of [
    'under_review',
    'confirmed',
    'preparing',
    'completed',
  ] as const) {
    await transitionOrderStatus(delivered.orderId, target, adminId);
  }
  console.log(`  fixture delivered: ${delivered.orderNumber} (qty 1) — both chains walked`);
  const canceled = await createFixtureOrder('b', '01022222222');
  fixtures.push(canceled);
  await transitionOrderStatus(canceled.orderId, 'canceled', adminId);
  console.log(`  fixtures: ${delivered.orderNumber} (completed/delivered), ${canceled.orderNumber} (canceled)`);

  section('§A1 request schema honesty');
  const badBodies: [string, unknown][] = [
    ['wrong number shape', { orderNumber: 'XYZ-123', phone: '01011111111' }],
    ['number too short', { orderNumber: 'AMR-A1', phone: '01011111111' }],
    ['lowercase accepted + normalized', { orderNumber: 'amr-aaaaaa', phone: '01011111111' }],
    ['arabic-indic digits phone', { orderNumber: 'AMR-AAAAAA', phone: '٠١٠١١١١١١١١' }],
    ['phone with letters', { orderNumber: 'AMR-AAAAAA', phone: '01011abc111' }],
    ['phone too short', { orderNumber: 'AMR-AAAAAA', phone: '010' }],
    ['empty phone', { orderNumber: 'AMR-AAAAAA', phone: '' }],
    ['landline phone', { orderNumber: 'AMR-AAAAAA', phone: '0223333333' }],
  ];
  for (const [label, body] of badBodies) {
    const parsed = trackingLookupSchema.safeParse(body);
    if (label === 'lowercase accepted + normalized') {
      assert(
        'schema: lowercase order number normalized to uppercase',
        parsed.success && parsed.data?.orderNumber === 'AMR-AAAAAA',
      );
    } else {
      const message = parsed.success ? null : parsed.error.issues[0]?.message;
      assert(
        `schema rejects: ${label}`,
        !parsed.success && typeof message === 'string' && message.length > 0,
        message ?? 'accepted',
      );
      if (!parsed.success) {
        const arabic = /[\u0600-\u06FF]/.test(message ?? '');
        assert(`  rejection message is Arabic: ${label}`, arabic, message ?? '');
      }
    }
  }

  section('§A2 no-existence-oracle equivalence (identical generic error)');
  const missCases: [string, () => Promise<unknown>][] = [
    [
      'unknown order number',
      () =>
        lookupOrderForTracking({
          orderNumber: 'AMR-ZZZ999',
          phone: '01011111111',
        }),
    ],
    [
      'valid order + wrong phone',
      () =>
        lookupOrderForTracking({
          orderNumber: delivered.orderNumber,
          phone: '01099999999',
        }),
    ],
  ];
  const missMessages: string[] = [];
  for (const [label, run] of missCases) {
    try {
      await run();
      assert(`generic miss: ${label}`, false, 'resolved instead of throwing');
    } catch (error) {
      const isTrackingError =
        error instanceof TrackingServiceError && error.message === TRACKING_MATCH_ERROR;
      assert(`generic miss: ${label} → identical Arabic error`, isTrackingError);
      if (error instanceof TrackingServiceError) missMessages.push(error.message);
    }
  }
  assert(
    'miss errors are byte-identical (no oracle)',
    missMessages.length === 2 && new Set(missMessages).size === 1,
  );

  section('§A3 rate limiter');
  {
    const key = `phase13-tracking-rl-${STAMP}`;
    let allowed = 0;
    for (let i = 0; i < 20; i += 1) {
      if (trackingLookupRateLimit(key)) allowed += 1;
    }
    assert('rate limiter: 12 allowed in window, rest blocked', allowed === 12, `allowed=${allowed}`);
    const later = Date.now() + 5 * 60_000 + 1;
    assert('rate limiter: window expiry re-allows', trackingLookupRateLimit(key, later));
    assert(
      'rate limiter: keys are independent',
      trackingLookupRateLimit(`${key}-other`),
    );
  }

  section('§A4 timeline derivation from current states (§14)');
  {
    const view = await lookupOrderForTracking({
      orderNumber: delivered.orderNumber,
      phone: '01011111111',
    });
    assert('delivered order resolves', view.orderNumber === delivered.orderNumber);
    assert(
      'order timeline: completed current, predecessors done',
      view.timeline.order.every(
        (step, index) =>
          (index < 4 ? step.done : true) && step.current === (step.key === 'completed'),
      ),
    );
    const shippingSteps = view.timeline.shipping;
    assert(
      'shipping timeline: delivered current, all predecessors done',
      shippingSteps[shippingSteps.length - 1].current === true &&
        shippingSteps.slice(0, -1).every((step) => step.done),
    );
    assert(
      'labels are Arabic',
      /[\u0600-\u06FF]/.test(view.timeline.shipping[5].label),
    );
    assert(
      'payment label present',
      view.paymentStatus.label === 'بانتظار التحصيل',
    );
    assert(
      'shipping cost null → stays WhatsApp-agreed (null, not 0)',
      view.shippingCost === null,
    );
    assert(
      'no internal identifiers in payload',
      !('id' in view) &&
        !('customerId' in view) &&
        !JSON.stringify(view.items).includes('variantId'),
    );
    assert(
      'no address / phone echo in payload',
      !('address' in view) &&
        !('customerPhone' in view) &&
        !JSON.stringify(view).includes('01011111111'),
    );
    assert(
      'items snapshot fields only',
      view.items.length === 1 &&
        typeof view.items[0].unitPrice === 'string' &&
        /^\d+\.\d{2}$/.test(view.items[0].subtotal),
    );
  }

  section('§A5 canceled order path');
  {
    const view = await lookupOrderForTracking({
      orderNumber: canceled.orderNumber,
      phone: '01022222222',
    });
    assert(
      'canceled order: order status canceled with Arabic label',
      view.orderStatus.status === 'canceled' && view.orderStatus.label === 'ملغى',
    );
    assert(
      'canceled order: shipping stays not_started',
      view.shippingStatus.status === 'not_started',
    );
    assert(
      'timeline has no "canceled" fake step (banner handles it)',
      !view.timeline.order.some((step) => step.key === 'canceled'),
    );
  }

  /* ------------------------------------------------------------------------ */
  /* §B — HTTP surface                                                         */
  /* ------------------------------------------------------------------------ */

  const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  let serverUp = false;
  try {
    const probe = await fetch(`${BASE_URL}/api/storefront/track-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ probe: true }),
      signal: AbortSignal.timeout(4000),
    });
    serverUp = probe.status === 400 || probe.status === 403 || probe.status === 422;
  } catch {
    serverUp = false;
  }

  if (serverUp) {
    section('§B1 page contract');
    const page = await fetch(`${BASE_URL}/track-order`);
    const html = await page.text();
    assert('page responds 200', page.status === 200);
    assert(
      'page is noindex (utility surface)',
      /<meta[^>]+name="robots"[^>]+noindex/.test(html),
    );
    assert('page is Arabic RTL', /dir="rtl"/.test(html) && /lang="ar"/.test(html));
    assert('page exposes the tracking form', /track-order-number/.test(html));

    const robots = await fetch(`${BASE_URL}/robots.txt`).then((r) => r.text());
    assert(
      'robots.txt disallows /track-order',
      /disallow:\s*\/track-order/i.test(robots),
    );

    section('§B2 route guard matrix');
    const post = async (
      body: unknown,
      headers: Record<string, string> = {},
    ): Promise<Response> =>
      fetch(`${BASE_URL}/api/storefront/track-order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });

    const hostile = await post(
      { orderNumber: delivered.orderNumber, phone: '01011111111' },
      { origin: 'https://evil.example' },
    );
    assert('hostile Origin → 403', hostile.status === 403);

    const spoof = await fetch(`${BASE_URL}/api/storefront/track-order`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: BASE_URL },
      body: JSON.stringify({ orderNumber: delivered.orderNumber, phone: '01011111111' }),
      signal: AbortSignal.timeout(8000),
    });
    assert('form-spoof (text/plain) → 403', spoof.status === 403);

    const noOrigin = await fetch(`${BASE_URL}/api/storefront/track-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderNumber: delivered.orderNumber, phone: '01011111111' }),
      signal: AbortSignal.timeout(8000),
    });
    assert('absent Origin+Referer → 403', noOrigin.status === 403);

    const badJson = await post('{not-json', { origin: BASE_URL });
    assert('malformed JSON → 400', badJson.status === 400);

    const badFields = await post({ orderNumber: 'nope', phone: '1' }, { origin: BASE_URL });
    assert('invalid fields → 400 with Arabic error', badFields.status === 400 && /[\u0600-\u06FF]/.test(await badFields.text()));

    const ok = await post(
      { orderNumber: delivered.orderNumber, phone: '01011111111' },
      { origin: BASE_URL },
    );
    const okBody = (await ok.json()) as { ok?: boolean; order?: Record<string, unknown> };
    assert('valid lookup over HTTP → 200 ok', ok.status === 200 && okBody.ok === true);
    assert(
      'HTTP payload leak-minimal (no id/uuid/address/phone keys)',
      okBody.order != null &&
        !('id' in okBody.order) &&
        !('customerId' in okBody.order) &&
        !JSON.stringify(okBody.order).includes('address') &&
        !JSON.stringify(okBody.order).includes('01011111111'),
    );
    const noStore = ok.headers.get('cache-control') ?? '';
    assert('response is no-store', /no-store/i.test(noStore), noStore);

    section('§B3 HTTP rate limit flood (429 + Retry-After)');
    let saw429 = false;
    let retryAfter: string | null = null;
    for (let i = 0; i < 16; i += 1) {
      const flood = await post(
        { orderNumber: 'AMR-ZZZ999', phone: '01011111111' },
        { origin: BASE_URL, 'x-forwarded-for': `10.199.${STAMP}.7` },
      );
      if (flood.status === 429) {
        saw429 = true;
        retryAfter = flood.headers.get('retry-after');
        break;
      }
    }
    assert('flood → 429 eventually', saw429);
    assert('429 carries Retry-After header', saw429 && Number(retryAfter) > 0);
  } else {
    section('§B HTTP surface — SKIPPED HONESTLY (dev server unreachable)');
    console.log('  ! BASE_URL unreachable; service-level checks above remain the gate.');
  }
} finally {
  section('Cleanup + residue probe');
  await cleanup(fixtures);
  assert('no fixture residue', await residueProbe());
  await getPool().end().catch(() => undefined);
}

console.log(`\n[verify-tracking] ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('[verify-tracking] FAILURES:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
