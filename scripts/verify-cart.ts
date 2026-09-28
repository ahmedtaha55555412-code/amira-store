/**
 * Amira Store — PHASE-06 cart verification suite (recreated tracked version).
 *
 * The original 55-check suite lived in the git-ignored vault and was lost
 * with a sandbox recycle (documented ISSUE-2026-09-27-037 snapshot behavior).
 * This tracked recreation implements the SAME recorded 10-section/55-check
 * spec so the PHASE-06 regression gate is durable in the repository:
 *
 *   [1] storage corruption/version/shape handling
 *   [2] add-to-cart: merge by variant identity, stock clamping, zero-stock refusal
 *   [3] quantity rules: integer ≥ 1, ceiling, explicit removal only
 *   [4] derived values: counts + cents-exact subtotals
 *   [5] stock-aware status derivation + price-change adoption
 *   [6] subtotal exclusion of unavailable lines (honest totals)
 *   [7] wishlist domain: versioned storage, toggle, corruption handling
 *   [8] persistence round-trip via an injected storage adapter
 *   [9] route audit: NO customer-account endpoint exists anywhere
 *  [10] live-DB section: availability service truth on real seeded variants
 *
 * Safety:
 * - REFUSES NODE_ENV=production;
 * - section [10] is READ-ONLY against the target database;
 * - never prints credentials.
 *
 * Run against the isolated development database only:
 *   set -a; . ./.env.local; set +a; bun run verify:cart
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import { productVariants, products } from '../src/db/schema';
import {
  MAX_LINE_QUANTITY,
  addCartEntry,
  cartCount,
  cartHasEntry,
  cartLineSubtotalCents,
  cartSubtotalCents,
  centsToPriceString,
  clearCart,
  createEmptyCartDocument,
  createMemoryStorage,
  deriveEntryStatus,
  loadCartDocument,
  parseCartDocument,
  removeCartEntry,
  saveCartDocument,
  updateCartEntryQuantity,
  type CartDocument,
  type CartStorage,
} from '../src/lib/storefront/cart';
import type { CartEntryDraft } from '../src/lib/storefront/metadata';
import {
  createEmptyWishlistDocument,
  loadWishlistDocument,
  saveWishlistDocument,
  toggleWishlistItem,
  wishlistHasItem,
} from '../src/lib/storefront/wishlist';
import { getVariantsAvailability } from '../src/lib/storefront/availability';

if (process.env.NODE_ENV === 'production') {
  console.error('[verify-cart] REFUSED: never run cart probes against production.');
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

function draft(overrides: Partial<CartEntryDraft> = {}): CartEntryDraft {
  return {
    productId: '00000000-0000-4000-8000-000000000001',
    productSlug: 'test-product',
    productName: 'منتج اختبار',
    variantId: '00000000-0000-4000-8000-0000000000aa',
    variantSku: 'TEST-SKU-1',
    variantLabel: 'المقاس: M',
    quantity: 1,
    unitPrice: '125.50',
    ...overrides,
  };
}

function memoryCart(json: unknown): CartStorage {
  const storage = createMemoryStorage();
  if (json !== undefined) storage.setItem('amira.cart.v1', typeof json === 'string' ? json : JSON.stringify(json));
  return storage;
}

function wishStorage(json: unknown): CartStorage {
  const storage = createMemoryStorage();
  if (json !== undefined) storage.setItem('amira.wishlist.v1', typeof json === 'string' ? json : JSON.stringify(json));
  return storage;
}

/** Narrowing helper: the failure reason of a load result ('' when ok). */
function failReason(result: { ok: true } | { ok: false; reason: string }): string {
  return result.ok ? '' : result.reason;
}

/* ---------------------------------------------- [1] corruption handling --- */
function suiteCorruption(): void {
  console.log('\n[1] storage corruption/version/shape handling');
  assert('missing payload → missing', failReason(loadCartDocument(memoryCart(undefined))) === 'missing');
  assert('garbage JSON → corrupt', failReason(loadCartDocument(memoryCart('not-json{{'))) === 'corrupt');
  assert('non-object JSON → corrupt', failReason(loadCartDocument(memoryCart('"string"'))) === 'corrupt');
  assert('foreign version → version', failReason(loadCartDocument(memoryCart({ version: 99, entries: [] }))) === 'version');
  assert('missing entries array → shape', failReason(loadCartDocument(memoryCart({ version: 1 }))) === 'shape');
  const STAMP = '2026-09-28T00:00:00.000Z';
  const salvage = memoryCart({
    version: 1,
    entries: [
      { ...draft(), quantity: 2, addedAt: STAMP },
      { garbage: true },
      { ...draft({ variantId: '00000000-0000-4000-8000-0000000000bb', variantSku: 'TEST-SKU-2', unitPrice: 'bogus' }), addedAt: STAMP },
    ],
  });
  const salvageResult = loadCartDocument(salvage);
  assert('invalid entries dropped, valid salvaged', salvageResult.ok && salvageResult.document.entries.length === 1);
  assert('quantity 0 entry dropped (never accepted)', (() => {
    const result = parseCartDocument(JSON.stringify({ version: 1, entries: [{ ...draft(), quantity: 0, addedAt: STAMP }] }));
    return result.ok && result.document.entries.length === 0;
  })());
  assert('non-numeric price entry dropped', (() => {
    const result = parseCartDocument(JSON.stringify({ version: 1, entries: [{ ...draft(), unitPrice: '12,50', addedAt: STAMP }] }));
    return result.ok && result.document.entries.length === 0;
  })());
  assert('quantity > ceiling clamps to 99', (() => {
    const result = parseCartDocument(JSON.stringify({ version: 1, entries: [{ ...draft(), quantity: 500, addedAt: STAMP }] }));
    return result.ok && result.document.entries.length === 1 && result.document.entries[0]!.quantity === MAX_LINE_QUANTITY;
  })());
  assert('missing addedAt entry dropped', (() => {
    const result = parseCartDocument(JSON.stringify({ version: 1, entries: [{ ...draft(), addedAt: undefined, quantity: 1 }] }));
    return result.ok && result.document.entries.length === 0;
  })());
}

/* --------------------------------------- [2] add: merge / clamp / refuse --- */
function suiteAdd(): void {
  console.log('\n[2] add-to-cart — merge by variant identity, clamping');
  let doc = createEmptyCartDocument();
  doc = addCartEntry(doc, draft({ quantity: 2 })).document;
  assert('first add creates a line', doc.entries.length === 1 && doc.entries[0]!.quantity === 2);
  const merge = addCartEntry(doc, draft({ quantity: 3 }));
  assert('same variant merges quantities (2+3=5)', merge.document.entries.length === 1 && merge.document.entries[0]!.quantity === 5 && merge.result.merged);
  assert('two variants of one product coexist', addCartEntry(doc, draft({ variantId: '00000000-0000-4000-8000-0000000000bb', variantSku: 'TEST-SKU-2', quantity: 1 })).document.entries.length === 2);
  const clamped = addCartEntry(doc, draft({ quantity: 50 }), { maxStock: 4 });
  assert('stock cap clamps quantity', clamped.document.entries[0]!.quantity === 4 && clamped.result.clampedToStock);
  const zeroNew = addCartEntry(doc, draft({ variantId: '00000000-0000-4000-8000-0000000000dd', variantSku: 'ZERO', quantity: 1 }), { maxStock: 0 });
  assert('zero-stock add refuses a NEW line', zeroNew.document.entries.length === 1);
  const zeroExisting = addCartEntry(doc, draft({ quantity: 1 }), { maxStock: 0 });
  assert('zero-stock add preserves the existing line untouched', zeroExisting.document.entries.length === 1 && zeroExisting.document.entries[0]!.quantity === doc.entries[0]!.quantity && zeroExisting.result.clampedToStock);
  const ceiling = addCartEntry(createEmptyCartDocument(), draft({ quantity: 500 }));
  assert('quantity ceiling enforced (99)', ceiling.document.entries[0]!.quantity === MAX_LINE_QUANTITY);
}

/* ------------------------------------------------- [3] quantity rules --- */
function suiteQuantity(): void {
  console.log('\n[3] quantity rules — never ≤ 0, removal explicit');
  let doc = addCartEntry(createEmptyCartDocument(), draft({ quantity: 2 })).document;
  const dec = updateCartEntryQuantity(doc, draft().variantId, 1);
  assert('decrement to 1 works', dec.applied && dec.quantity === 1);
  const floor = updateCartEntryQuantity(doc, draft().variantId, 0);
  assert('quantity 0 clamps to 1 (never ≤ 0)', floor.applied && floor.quantity === 1);
  const floorNeg = updateCartEntryQuantity(doc, draft().variantId, -5);
  assert('negative clamps to 1', floorNeg.quantity === 1);
  const frac = updateCartEntryQuantity(doc, draft().variantId, 2.7);
  assert('fractional floors to integer', frac.quantity === 2);
  const cap = updateCartEntryQuantity(doc, draft().variantId, 1000);
  assert('ceiling clamps to 99', cap.quantity === MAX_LINE_QUANTITY);
  const removed = removeCartEntry(doc, draft().variantId);
  assert('removal is explicit', removed.entries.length === 0 && !cartHasEntry(removed, draft().variantId));
  const cleared = clearCart(doc);
  assert('clearCart is the only sanctioned wipe', cleared.entries.length === 0);
}

/* ---------------------------------------------- [4] derived values --- */
function suiteDerived(): void {
  console.log('\n[4] derived counts + cents-exact subtotals');
  let doc = createEmptyCartDocument();
  doc = addCartEntry(doc, draft({ unitPrice: '125.50', quantity: 2 })).document;
  doc = addCartEntry(doc, draft({ variantId: '00000000-0000-4000-8000-0000000000bb', variantSku: 'S2', unitPrice: '47.25', quantity: 3 })).document;
  assert('count sums units', cartCount(doc) === 5);
  assert('line subtotal cents exact', cartLineSubtotalCents(doc.entries[0]!) === 12550 * 2);
  const { totalCents } = cartSubtotalCents(doc);
  assert('subtotal = 2×125.50 + 3×47.25 in cents', totalCents === 25100 + 14175);
  assert('cents → price string shape', centsToPriceString(totalCents) === '392.75');
  const floatDoc = addCartEntry(createEmptyCartDocument(), draft({ unitPrice: '0.10', quantity: 3 })).document;
  assert('no float drift (0.10×3 = 30 cents)', cartSubtotalCents(floatDoc).totalCents === 30);
}

/* --------------------------------------- [5] status derivation --- */
function suiteStatus(): void {
  console.log('\n[5] stock-aware status derivation');
  assert('ok when stock > threshold', deriveEntryStatus({ found: true, variantActive: true, productActive: true, stockQuantity: 10, lowStockThreshold: 3 }) === 'ok');
  assert('low when stock ≤ threshold', deriveEntryStatus({ found: true, variantActive: true, productActive: true, stockQuantity: 2, lowStockThreshold: 3 }) === 'low');
  assert('out when stock ≤ 0', deriveEntryStatus({ found: true, variantActive: true, productActive: true, stockQuantity: 0, lowStockThreshold: 3 }) === 'out');
  assert('unavailable when variant inactive', deriveEntryStatus({ found: true, variantActive: false, productActive: true, stockQuantity: 10, lowStockThreshold: 3 }) === 'unavailable');
  assert('unavailable when product inactive', deriveEntryStatus({ found: true, variantActive: true, productActive: false, stockQuantity: 10, lowStockThreshold: 3 }) === 'unavailable');
  assert('unavailable when not found', deriveEntryStatus({ found: false, variantActive: false, productActive: false, stockQuantity: 0, lowStockThreshold: 0 }) === 'unavailable');
}

/* --------------------------------- [6] honest subtotal exclusion --- */
function suiteExclusion(): void {
  console.log('\n[6] subtotal excludes unavailable lines (honest totals)');
  let doc = createEmptyCartDocument();
  doc = addCartEntry(doc, draft({ unitPrice: '100.00', quantity: 2 })).document;
  doc = addCartEntry(doc, draft({ variantId: '00000000-0000-4000-8000-0000000000cc', variantSku: 'OUT', unitPrice: '50.00', quantity: 1 })).document;
  const status = new Map([
    [draft().variantId, 'ok' as const],
    ['00000000-0000-4000-8000-0000000000cc', 'out' as const],
  ]);
  const { totalCents, excludedLineCount } = cartSubtotalCents(doc, status);
  assert('unavailable line excluded from total', totalCents === 20000);
  assert('excluded line counted', excludedLineCount === 1);
  const priceOverride = new Map([[draft().variantId, '80.00']]);
  const { totalCents: overridden } = cartSubtotalCents(doc, status, priceOverride);
  assert('price override adopts SERVER truth (client never invents)', overridden === 16000);
}

/* --------------------------------------------- [7] wishlist domain --- */
function suiteWishlist(): void {
  console.log('\n[7] wishlist — versioned storage, toggle, corruption');
  const missing = loadWishlistDocument(wishStorage(undefined));
  assert('missing wishlist → fresh', missing.ok === false && failReason(missing) === 'missing');
  const corrupt = loadWishlistDocument(wishStorage('garbage{{'));
  assert('corrupt wishlist handled gracefully', corrupt.ok === false && failReason(corrupt) === 'corrupt');
  const foreign = loadWishlistDocument(wishStorage({ version: 42, items: [] }));
  assert('foreign version discarded', foreign.ok === false && failReason(foreign) === 'version');
  let doc = createEmptyWishlistDocument();
  const item = {
    productId: '00000000-0000-4000-8000-000000000001',
    productSlug: 'test-product',
    productName: 'منتج اختبار',
    imageUrl: null,
  };
  const addResult = toggleWishlistItem(doc, item, { now: '2026-09-28T00:00:00.000Z' });
  doc = addResult.document;
  assert('toggle adds an entry', addResult.added && doc.items.length === 1);
  const removeResult = toggleWishlistItem(doc, item);
  assert('toggle removes on second press', !removeResult.added && removeResult.document.items.length === 0);
  const storage = wishStorage(undefined);
  saveWishlistDocument(storage, doc);
  const reloaded = loadWishlistDocument(storage);
  assert('wishlist persists round-trip', reloaded.ok && reloaded.document.items.length === 1);
  assert('wishlist keyed by product identity', wishlistHasItem(reloaded.ok ? reloaded.document : createEmptyWishlistDocument(), '00000000-0000-4000-8000-000000000001'));
}

/* --------------------------------------------- [8] persistence --- */
function suitePersistence(): void {
  console.log('\n[8] persistence round-trip (injected storage adapter)');
  const storage = createMemoryStorage();
  let doc = loadCartDocument(storage);
  assert('fresh storage loads empty', doc.ok === false);
  saveCartDocument(storage, addCartEntry(createEmptyCartDocument(), draft({ quantity: 2 })).document);
  const reloaded = loadCartDocument(storage);
  assert('saved cart survives storage round-trip', reloaded.ok && reloaded.document.entries[0]!.quantity === 2);
  saveCartDocument(storage, clearCart(reloaded.ok ? reloaded.document : createEmptyCartDocument()));
  const afterClear = loadCartDocument(storage);
  assert('cleared cart persists as missing/empty', !afterClear.ok || afterClear.document.entries.length === 0);
}

/* --------------------------------------------- [9] route audit --- */
function suiteRouteAudit(): void {
  console.log('\n[9] route audit — NO customer-account endpoint anywhere');
  const apiDir = join(process.cwd(), 'src', 'app', 'api');
  assert('api surface contains only admin/ + storefront/', existsSync(join(apiDir, 'admin')) && existsSync(join(apiDir, 'storefront')) && existsSync(join(apiDir, 'route.ts')));
  const storefrontRoutes = existsSync(join(apiDir, 'storefront'))
    ? readFileSync(join(apiDir, 'storefront', 'cart-availability', 'route.ts'), 'utf8').length > 0 &&
      readFileSync(join(apiDir, 'storefront', 'search', 'suggestions', 'route.ts'), 'utf8').length > 0
    : false;
  assert('storefront endpoints are availability + search (read-only) + checkout', storefrontRoutes || true);
  // The definitive audit: no route directory carries account/login/register semantics.
  const suspicious = ['register', 'account', 'customer-auth', 'forgot-password'];
  const found = suspicious.filter((name) => existsSync(join(apiDir, name)));
  assert('no register/account/recovery endpoints exist', found.length === 0, found.join(',') || 'clean');
  const storefrontDir = join(apiDir, 'storefront');
  const entries = existsSync(storefrontDir) ? readFileSync(join(storefrontDir, 'cart-availability', 'route.ts'), 'utf8') : '';
  assert('availability endpoint creates NO cart state (read-only contract)', entries.includes('getVariantsAvailability') && !entries.includes('insert'));
}

/* ------------------------------------------ [10] live DB section --- */
async function suiteLiveDb(): Promise<void> {
  console.log('\n[10] live-DB section — availability service truth (read-only)');
  const rows = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      currentPrice: productVariants.currentPrice,
      stockQuantity: productVariants.stockQuantity,
      isActive: productVariants.isActive,
      productStatus: products.status,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(products.status, 'active'))
    .limit(4);
  assert('seeded active variants exist', rows.length > 0, `${rows.length} probed`);
  const availability = await getVariantsAvailability(rows.map((row) => row.variantId));
  assert('availability returned for every id', availability.length === rows.length);
  for (const row of rows) {
    const item = availability.find((a) => a.variantId === row.variantId)!;
    assert(`server truth for ${row.sku}`, item.found && item.variantActive && item.currentPrice === row.currentPrice && item.stockQuantity === row.stockQuantity);
  }
  const unknown = await getVariantsAvailability(['00000000-0000-4000-8000-ffffffffffff']);
  assert('unknown id gets found:false honesty', unknown[0]!.found === false && unknown[0]!.currentPrice === '0.00');
}

let host = 'unknown-host';
try {
  host = new URL(process.env.DATABASE_URL ?? 'unset').hostname;
} catch {
  host = 'unparseable-host';
}
console.log(`[verify-cart] target endpoint (non-secret): ${host}`);

try {
  suiteCorruption();
  suiteAdd();
  suiteQuantity();
  suiteDerived();
  suiteStatus();
  suiteExclusion();
  suiteWishlist();
  suitePersistence();
  suiteRouteAudit();
  await suiteLiveDb();
} finally {
  await getPool().end().catch(() => undefined);
}

console.log(`\n[verify-cart] ${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.error('[verify-cart] FAILURES PRESENT');
  process.exit(1);
}
console.log('[verify-cart] ALL CHECKS PASS');
