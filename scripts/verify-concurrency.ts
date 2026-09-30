/**
 * Amira Store — PHASE-13 concurrency suite (REAL parallel HTTP + DB truth).
 *
 * Directive §5: prove with real concurrent requests, capture database-truth
 * evidence (not only HTTP responses):
 *   A  two simultaneous purchases competing for FINAL stock
 *      → no oversell, one winner, correct movement count
 *   B  repeated checkout submission with the SAME idempotency key
 *      → one order, one deduction, no duplicate side effects
 *   C  same variant purchased concurrently from MULTIPLE SESSIONS
 *      → serialized correctness, no negative stock, ledger consistent
 *   D  concurrent admin order edits affecting inventory
 *      → transaction-safe final state = exactly one full line-set,
 *        stock truth intact, ledger continuous
 *
 * Rate-limit note: the checkout limiter is per-instance keyed by hashed IP
 * (12 / 5 min). Section B deliberately reuses one IP (5 < 12); every other
 * section assigns distinct X-Forwarded-For identities per probe.
 *
 * House rules: refuses NODE_ENV=production; fixtures via REAL checkout/admin
 * services; LIFO cleanup + residue probes; never prints credentials.
 *
 * Env: DATABASE_URL, BASE_URL (default http://localhost:3000 — unreachable
 * server aborts the suite honestly), ADMIN_QA_USERNAME/ADMIN_QA_PASSWORD.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';

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
import { products } from '../src/db/schema';

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
  console.error('[verify:concurrency] refuses to run outside development.');
  process.exit(1);
}

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const STAMP = Date.now().toString(36);

async function checkoutHttp(input: {
  variantId: string;
  quantity: number;
  idempotencyKey: string;
  ip: string;
  name?: string;
}): Promise<{
  status: number;
  body: {
    ok?: boolean;
    order?: { orderNumber: string };
    lineErrors?: unknown[];
    error?: string;
  };
}> {
  const response = await fetch(`${BASE_URL}/api/storefront/checkout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: BASE_URL,
      'x-forwarded-for': input.ip,
    },
    body: JSON.stringify({
      items: [{ variantId: input.variantId, quantity: input.quantity }],
      customerName: input.name ?? 'عميل تزامن',
      customerPhone: '01055500000',
      address: 'الجيزة - شارع التزامن رقم ٩',
      idempotencyKey: input.idempotencyKey,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = (await response.json().catch(() => ({}))) as never;
  return { status: response.status, body };
}

async function setStock(variantId: string, stock: number) {
  await db
    .update(productVariants)
    .set({ stockQuantity: stock })
    .where(eq(productVariants.id, variantId));
}

async function pickVariant(minStock: number): Promise<string> {
  // ACTIVE variant on an ACTIVE product — rejected 409s must mean stock truth,
  // not an inactive-variant fixture accident.
  const [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        sql`${productVariants.stockQuantity} >= ${minStock}`,
        eq(productVariants.isActive, true),
        eq(products.status, 'active'),
      ),
    )
    .orderBy(sql`${productVariants.stockQuantity} asc`)
    .limit(1);
  if (!variant) throw new Error(`no active variant with stock >= ${minStock}`);
  return variant.id;
}

/** Ledger continuity for one variant: before == prev after; head == live. */
async function ledgerConsistent(variantId: string): Promise<{ ok: boolean; detail: string }> {
  const rows = await db
    .select({
      before: inventoryMovements.stockBefore,
      after: inventoryMovements.stockAfter,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.variantId, variantId))
    .orderBy(inventoryMovements.createdAt);

  /* Ties: genuinely parallel transactions can commit with the SAME
     transaction-start timestamp, so rows within one timestamp form a GROUP
     that may linearize in any order. Validate greedily: a group is valid iff
     some permutation chains from the current head (bounded permutation
     search — groups here are tiny). */
  let head: number | null = null;
  let index = 0;
  while (index < rows.length) {
    const stamp = rows[index].createdAt.getTime();
    let groupEnd = index;
    while (groupEnd < rows.length && rows[groupEnd].createdAt.getTime() === stamp) {
      groupEnd += 1;
    }
    const group = rows.slice(index, groupEnd);
    if (group.length > 8) {
      return { ok: false, detail: `timestamp tie group too large (${group.length}) to linearize` };
    }
    let valid = false;
    for (const permutation of permutations(group)) {
      let cursor = head;
      let chainOk = true;
      for (const row of permutation) {
        if (cursor !== null && row.before !== cursor) {
          chainOk = false;
          break;
        }
        cursor = row.after;
      }
      if (chainOk) {
        valid = true;
        head = cursor;
        break;
      }
    }
    if (!valid) {
      return { ok: false, detail: `chain break inside timestamp group at movement ${index}` };
    }
    index = groupEnd;
  }

  const [live] = await db
    .select({ stock: productVariants.stockQuantity })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  if (rows.length > 0 && head !== live.stock) {
    return { ok: false, detail: `head ${head} != live ${live.stock}` };
  }
  return { ok: true, detail: `movements=${rows.length}, live=${live.stock}` };
}

/** All permutations of a small array (bounded n for tie groups). */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) {
      result.push([items[i], ...tail]);
    }
  }
  return result;
}

/* Track every touched variant + created order for cleanup/restoration. */
const touchedVariants = new Map<string, number>(); // id → original stock
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

async function trackOrderByKey(idempotencyKey: string) {
  const [row] = await db
    .select({ id: orders.id, customerId: orders.customerId })
    .from(orders)
    .where(eq(orders.idempotencyKey, idempotencyKey))
    .limit(1);
  if (row) {
    createdOrderIds.push(row.id);
    createdCustomerIds.add(row.customerId);
  }
}

let adminId = '';
let qaCookie = '';

try {
  section('§0 prerequisites');
  {
    const [admin] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
    if (!admin) throw new Error('no admin user');
    adminId = admin.id;

    const QA_USERNAME = process.env.ADMIN_QA_USERNAME ?? '';
    const QA_PASSWORD = process.env.ADMIN_QA_PASSWORD ?? '';
    if (!QA_USERNAME || !QA_PASSWORD) throw new Error('ADMIN_QA_USERNAME/ADMIN_QA_PASSWORD unset');
    const loginResponse = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL },
      body: JSON.stringify({ username: QA_USERNAME, password: QA_PASSWORD }),
      signal: AbortSignal.timeout(8000),
    });
    if (loginResponse.status !== 200) throw new Error(`QA admin login failed: ${loginResponse.status}`);
    const cookie = (loginResponse.headers.getSetCookie?.() ?? [])
      .find((c) => /^amira_admin_session=/i.test(c));
    if (!cookie) throw new Error('no session cookie');
    qaCookie = cookie.split(';')[0];
    assert('prerequisites ready (admin + QA session)', true);
  }

  /* ---------------------------------------------------------------------- */
  section('§A two simultaneous purchases competing for FINAL stock');
  {
    const variantId = await pickVariant(1);
    await trackVariant(variantId);
    await setStock(variantId, 1); // exactly ONE unit left

    const results = await Promise.all([
      checkoutHttp({ variantId, quantity: 1, idempotencyKey: `cc-a1-${STAMP}`, ip: '10.201.0.1' }),
      checkoutHttp({ variantId, quantity: 1, idempotencyKey: `cc-a2-${STAMP}`, ip: '10.201.0.2' }),
    ]);
    // HTTP contract: winner 200 ok:true; stock loser 409 ok:false + lineErrors
    const created = results.filter((r) => r.status === 200 && r.body.ok === true);
    const rejected = results.filter((r) => r.status === 409 && r.body.ok === false);
    assert('exactly one winner (200 ok)', created.length === 1, `created=${created.length}`);
    assert(
      'loser honestly rejected out_of_stock (409 + lineErrors)',
      rejected.length === 1 &&
        JSON.stringify(rejected[0].body.lineErrors ?? []).includes('out_of_stock'),
    );

    await trackOrderByKey(`cc-a1-${STAMP}`);
    await trackOrderByKey(`cc-a2-${STAMP}`);
    const [stock] = await db
      .select({ stock: productVariants.stockQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    assert('DB truth: final stock 0 (no oversell, no negative)', stock.stock === 0, `stock=${stock.stock}`);

    const sectionAOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.idempotencyKey, [`cc-a1-${STAMP}`, `cc-a2-${STAMP}`]));
    const movements = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.variantId, variantId),
          eq(inventoryMovements.movementType, 'sale'),
          inArray(inventoryMovements.orderId, sectionAOrders.map((row) => row.id)),
        ),
      );
    assert('DB truth: exactly ONE new sale movement', movements[0].n === 1, `movements=${movements[0].n}`);

    const consistency = await ledgerConsistent(variantId);
    assert('DB truth: ledger remains mathematically consistent', consistency.ok, consistency.detail);
  }

  /* ---------------------------------------------------------------------- */
  section('§B repeated submission with the SAME idempotency key');
  {
    const variantId = await pickVariant(5);
    await trackVariant(variantId);
    const key = `cc-b-${STAMP}`;

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        checkoutHttp({ variantId, quantity: 2, idempotencyKey: key, ip: `10.202.0.${i + 1}` }),
      ),
    );
    // created and idempotent_replay are DELIBERATELY indistinguishable over
    // HTTP (a duplicate submit must never look like a second order) — the
    // one-order proof is the DB truth below.
    const ok = results.filter((r) => r.status === 200 && r.body.ok === true);
    assert('all five submissions answered 200 ok (no second-order confusion)', ok.length === 5, `ok=${ok.length}`);
    const winnerNumber = ok[0]?.body.order?.orderNumber;
    assert(
      'every duplicate submit serves the SAME order number',
      ok.every((r) => r.body.order?.orderNumber === winnerNumber),
    );

    await trackOrderByKey(key);
    const orderRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.idempotencyKey, key));
    assert('DB truth: exactly ONE order row for the key', orderRows[0].n === 1);

    const itemRows = await db
      .select({ qty: orderItems.quantity })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orders.idempotencyKey, key));
    assert(
      'DB truth: single line, quantity 2 (no merge duplication)',
      itemRows.length === 1 && itemRows[0].qty === 2,
    );

    const sectionBOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.idempotencyKey, key));
    const movements = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.variantId, variantId),
          eq(inventoryMovements.movementType, 'sale'),
          inArray(inventoryMovements.orderId, sectionBOrders.map((row) => row.id)),
        ),
      );
    assert('DB truth: ONE deduction movement (not five)', movements[0].n === 1, `movements=${movements[0].n}`);

    const consistency = await ledgerConsistent(variantId);
    assert('DB truth: ledger consistent', consistency.ok, consistency.detail);
  }

  /* ---------------------------------------------------------------------- */
  section('§C same variant purchased concurrently from MULTIPLE sessions');
  {
    const variantId = await pickVariant(3);
    await trackVariant(variantId);
    await setStock(variantId, 3);

    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        checkoutHttp({
          variantId,
          quantity: 1,
          idempotencyKey: `cc-c${i}-${STAMP}`,
          ip: `10.203.0.${i + 1}`,
        }),
      ),
    );
    const created = results.filter((r) => r.status === 200 && r.body.ok === true);
    const rejected = results.filter((r) => r.status === 409 && r.body.ok === false);
    assert('3 sessions win, 1 honest rejection', created.length === 3 && rejected.length === 1, `created=${created.length}, rejected=${rejected.length}`);

    for (let i = 0; i < 4; i += 1) await trackOrderByKey(`cc-c${i}-${STAMP}`);
    // scope the movement count to THIS section's created orders (the variant
    // may carry movements from earlier sections within the same minute)
    const sectionCOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.idempotencyKey, [`cc-c0-${STAMP}`, `cc-c1-${STAMP}`, `cc-c2-${STAMP}`, `cc-c3-${STAMP}`]));
    const sectionCOrderIds = sectionCOrders.map((row) => row.id);

    const [stock] = await db
      .select({ stock: productVariants.stockQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    assert('DB truth: final stock exactly 0 (serialized decrement)', stock.stock === 0, `stock=${stock.stock}`);

    const movements = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.variantId, variantId),
          eq(inventoryMovements.movementType, 'sale'),
          inArray(inventoryMovements.orderId, sectionCOrderIds),
        ),
      );
    assert('DB truth: exactly 3 sale movements (one per winning session)', movements[0].n === 3, `movements=${movements[0].n}`);

    const consistency = await ledgerConsistent(variantId);
    assert('DB truth: ledger chain continuous + head == live', consistency.ok, consistency.detail);
  }

  /* ---------------------------------------------------------------------- */
  section('§D concurrent admin order edits where inventory is affected');
  {
    // fixture order: 1×V1 via real checkout
    const v1 = await pickVariant(5);
    await trackVariant(v1);
    await setStock(v1, 10);
    const fixtureKey = `cc-d-fixture-${STAMP}`;
    const fixture = await createOrderFromCart({
      items: [{ variantId: v1, quantity: 1 }],
      customerName: 'عميل تعديل متوازٍ',
      customerPhone: '01055511111',
      address: 'القاهرة - شارع التعديل المتوازي ٤',
      idempotencyKey: fixtureKey,
    });
    if (fixture.status !== 'created') throw new Error('fixture order for §D failed');
    await trackOrderByKey(fixtureKey);
    const [orderRow] = await db
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.idempotencyKey, fixtureKey))
      .limit(1);

    const v2 = await pickVariant(4);
    if (v2 === v1) throw new Error('could not find a second distinct variant for §D');
    await trackVariant(v2);
    await setStock(v2, 8);

    // two PARALLEL full-line-set edits: A = {V1×1, V2×2}; B = {V1×3}
    const editA = fetch(`${BASE_URL}/api/admin/orders/${orderRow.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL, cookie: qaCookie },
      body: JSON.stringify({ items: [{ variantId: v1, quantity: 1 }, { variantId: v2, quantity: 2 }] }),
      signal: AbortSignal.timeout(15000),
    });
    const editB = fetch(`${BASE_URL}/api/admin/orders/${orderRow.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL, cookie: qaCookie },
      body: JSON.stringify({ items: [{ variantId: v1, quantity: 3 }] }),
      signal: AbortSignal.timeout(15000),
    });
    const [ra, rb] = await Promise.all([editA, editB]);
    const aOk = ra.status === 200;
    const bOk = rb.status === 200;
    assert('both concurrent edits answered (serialized, no corruption)', (aOk && bOk) || (aOk !== bOk), `A=${ra.status}, B=${rb.status}`);

    // final state must be exactly ONE of the two full line-sets
    const lines = await db
      .select({ variantId: orderItems.variantId, qty: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderRow.id));
    const normalized = lines.map((l) => `${l.variantId}:${l.qty}`).sort().join('|');
    const shapeA = [`${v1}:1`, `${v2}:2`].sort().join('|');
    const shapeB = `${v1}:3`;
    assert(
      'DB truth: final line-set is exactly edit A or edit B (no merge)',
      normalized === shapeA || normalized === shapeB,
      normalized,
    );

    // winners' inventory truth: ledger for V1 must reconcile with the final qty
    const [v1stock] = await db
      .select({ stock: productVariants.stockQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, v1));
    const [money] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.id, orderRow.id),
          sql`${orders.grandTotal} <> ${orders.productsTotal} + coalesce(${orders.shippingCost}, 0)`,
        ),
      );
    assert('DB truth: order money identity preserved after races', money.n === 0);
    assert('DB truth: V1 stock never negative', v1stock.stock >= 0, `stock=${v1stock.stock}`);

    const consistency = await ledgerConsistent(v1);
    assert('DB truth: V1 ledger continuous + head == live', consistency.ok, consistency.detail);

    // cleanup §D order explicitly (fixture tracked via key)
  }

  /* ---------------------------------------------------------------------- */
  section('Cleanup + residue probes');
  {
    // orders + items + movements + customers for everything created here
    if (createdOrderIds.length > 0) {
      await db.delete(inventoryMovements).where(inArray(inventoryMovements.orderId, createdOrderIds));
      await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (createdCustomerIds.size > 0) {
      await db.delete(customers).where(inArray(customers.id, [...createdCustomerIds]));
    }
    for (const [variantId, originalStock] of touchedVariants) {
      await setStock(variantId, originalStock);
    }
    const residueOrders = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(sql`${orders.idempotencyKey} like ${`cc-%${STAMP}`}`);
    assert('no fixture order residue', residueOrders[0].n === 0, `n=${residueOrders[0].n}`);
  }
} catch (error) {
  failed += 1;
  failures.push(`SUITE ABORTED: ${(error as Error).message}`);
  console.error(`\n[verify:concurrency] SUITE ABORTED: ${(error as Error).message}`);
  // best-effort cleanup even on abort
  try {
    if (createdOrderIds.length > 0) {
      await db.delete(inventoryMovements).where(inArray(inventoryMovements.orderId, createdOrderIds));
      await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (createdCustomerIds.size > 0) {
      await db.delete(customers).where(inArray(customers.id, [...createdCustomerIds]));
    }
    for (const [variantId, originalStock] of touchedVariants) {
      await setStock(variantId, originalStock);
    }
  } catch {
    /* abort path — residue reported by the failure list */
  }
} finally {
  await getPool().end().catch(() => undefined);
}

console.log(`\n[verify:concurrency] ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('[verify:concurrency] FAILURES:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
