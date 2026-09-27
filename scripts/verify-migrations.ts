/**
 * Amira Store — migration + constraint verification (PHASE-02).
 *
 * What it does (docs/phases/PHASE-02.md "Verification scenarios" +
 * "Critical business invariants"):
 *  1. verifies the applied migrations match the repository journal;
 *  2. asserts every POSITIVE verification scenario over seeded data
 *     (size-only / color-only / size+color / no-attribute products, variant
 *     price & stock independence, variant images, multi-image products);
 *  3. asserts every BUSINESS INVARIANT is DB-enforced via transient
 *     transactional probes that ALWAYS roll back (duplicate SKU/slug,
 *     negative stock, same-attribute-twice on a variant, money identities,
 *     one verified review per order item, single cancellation return per
 *     order, settings singleton, session token uniqueness).
 *
 * Safety:
 * - REFUSES to run when NODE_ENV === "production" (probes mutate transiently);
 * - every negative probe runs inside a transaction that is rolled back;
 * - the few probe rows created outside rollbacks are deleted in FK-safe order
 *   at the end, so nothing persists.
 *
 * Run (disposable dev database only): bun run db:verify
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { and, eq, like, sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import {
  adminSessions,
  adminUsers,
  attributeValues,
  attributes,
  categories,
  customers,
  inventoryMovements,
  orderItems,
  orders,
  productImages,
  productVariants,
  products,
  reviews,
  storeSettings,
  variantAttributeValues,
} from '../src/db/schema';

/* -------------------------------------------------------------------------- */
/* Guard + helpers                                                             */
/* -------------------------------------------------------------------------- */

if (process.env.NODE_ENV === 'production') {
  console.error('[db-verify] REFUSED: never run probes against production.');
  process.exit(1);
}

class ProbeAlive extends Error {}

let failures = 0;
let passes = 0;

function pass(name: string, detail = ''): void {
  passes += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail = ''): void {
  failures += 1;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Runs `probe` inside a rolled-back transaction; expects the DB to reject it. */
async function expectReject(name: string, probe: (tx: Tx) => Promise<unknown>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await probe(tx);
      throw new ProbeAlive();
    });
    fail(name, 'DB accepted the write (constraint NOT enforced)');
  } catch (error) {
    if (error instanceof ProbeAlive) {
      fail(name, 'probe never failed — constraint missing');
      return;
    }
    const detail =
      (error as { constraint?: string }).constraint ??
      (error as { code?: string }).code ??
      (error as Error).message;
    pass(name, `rejected (${detail})`);
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Migration state                                                          */
/* -------------------------------------------------------------------------- */

console.log('\n[1] Migration state');
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const journal = JSON.parse(
    readFileSync(path.resolve(here, '../drizzle/meta/_journal.json'), 'utf8'),
  ) as { entries: unknown[] };
  const applied = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
  );
  if (applied.rows[0].n === journal.entries.length) {
    pass('migrations current', `${applied.rows[0].n}/${journal.entries.length} applied`);
  } else {
    fail(
      'migrations current',
      `applied=${applied.rows[0].n} repository=${journal.entries.length} — run bun run db:migrate`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Positive verification scenarios (over seeded catalog)                    */
/* -------------------------------------------------------------------------- */

console.log('\n[2] PHASE-02 verification scenarios');

async function variantAttrMatrix(productId: string) {
  return db
    .select({ attrSlug: attributes.slug })
    .from(productVariants)
    .leftJoin(
      variantAttributeValues,
      eq(variantAttributeValues.variantId, productVariants.id),
    )
    .leftJoin(attributes, eq(attributes.id, variantAttributeValues.attributeId))
    .where(eq(productVariants.productId, productId));
}

async function productIdBySlug(slug: string): Promise<string> {
  const [p] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug));
  return p.id;
}

{
  const p = await productIdBySlug('men-classic-shirt');
  const matrix = await variantAttrMatrix(p);
  const ok = matrix.length > 0 && matrix.every((r) => r.attrSlug === 'size');
  if (ok) pass('size-only product can exist');
  else fail('size-only product can exist');
}

{
  const p = await productIdBySlug('women-silk-scarf');
  const matrix = await variantAttrMatrix(p);
  const ok = matrix.length > 0 && matrix.every((r) => r.attrSlug === 'color');
  if (ok) pass('color-only product can exist');
  else fail('color-only product can exist');
}

{
  const p = await productIdBySlug('kids-tshirt-basics');
  const rows = await db
    .select({ sku: productVariants.sku, attrSlug: attributes.slug })
    .from(productVariants)
    .leftJoin(
      variantAttributeValues,
      eq(variantAttributeValues.variantId, productVariants.id),
    )
    .leftJoin(attributes, eq(attributes.id, variantAttributeValues.attributeId))
    .where(eq(productVariants.productId, p));
  const byVariant = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byVariant.has(r.sku)) byVariant.set(r.sku, new Set());
    if (r.attrSlug) byVariant.get(r.sku)!.add(r.attrSlug);
  }
  const shapes = [...byVariant.values()];
  const ok =
    shapes.length > 0 &&
    shapes.every((s) => s.size === 2 && s.has('size') && s.has('color'));
  if (ok) pass('size+color product can exist (explicit variants only, no forced matrix)');
  else fail('size+color product can exist');
}

{
  const p = await productIdBySlug('baby-cotton-towel');
  const matrix = await variantAttrMatrix(p);
  const ok = matrix.length === 1 && matrix.every((r) => r.attrSlug === null);
  if (ok) pass('product with no selectable attribute can exist (default variant)');
  else fail('product with no selectable attribute (default variant)');
}

{
  const p = await productIdBySlug('men-classic-shirt');
  const variants = await db
    .select({
      price: productVariants.currentPrice,
      stock: productVariants.stockQuantity,
    })
    .from(productVariants)
    .where(eq(productVariants.productId, p));
  if (new Set(variants.map((v) => v.price)).size > 1) pass('two variants may have different prices');
  else fail('two variants may have different prices');
  if (new Set(variants.map((v) => v.stock)).size > 1) pass('two variants may have different stock');
  else fail('two variants may have different stock');
}

{
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productImages)
    .where(sql`${productImages.variantId} IS NOT NULL`);
  if (rows[0].n > 0) pass('a variant may have different images', `${rows[0].n} variant-specific image rows`);
  else fail('a variant may have different images');
}

{
  const p = await productIdBySlug('women-silk-scarf');
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productImages)
    .where(and(eq(productImages.productId, p), sql`${productImages.variantId} IS NULL`));
  if (rows[0].n >= 2) pass('a product can have many images');
  else fail('a product can have many images', 'expected ≥2 gallery images');
}

{
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'idx_products_created_at_desc'`,
  );
  if (rows.rows[0].n === 1) pass('New-Arrivals index on products.created_at exists (no featured flags)');
  else fail('New-Arrivals index on products.created_at exists');
}

/* -------------------------------------------------------------------------- */
/* 3. Business invariants — DB-enforced probes                                 */
/* -------------------------------------------------------------------------- */

console.log('\n[3] Business invariants (transient, rolled back)');

const [womenCat] = await db
  .select({ id: categories.id })
  .from(categories)
  .where(eq(categories.slug, 'women'));

// Scratch catalog rows (cleaned up in FK-safe order at the very end).
const [probeProduct] = await db
  .insert(products)
  .values({ slug: 'zz-probe-product', name: 'بروب', categoryId: womenCat.id })
  .returning({ id: products.id });

const [probeVariant] = await db
  .insert(productVariants)
  .values({
    productId: probeProduct.id,
    sku: 'ZZ-PROBE-1',
    originalPrice: '100.00',
    currentPrice: '90.00',
    stockQuantity: 5,
  })
  .returning({ id: productVariants.id });

const [sizeAttr] = await db
  .select({ id: attributes.id })
  .from(attributes)
  .where(eq(attributes.slug, 'size'));
const [sizeValM] = await db
  .select({ id: attributeValues.id })
  .from(attributeValues)
  .where(and(eq(attributeValues.attributeId, sizeAttr.id), eq(attributeValues.slug, 'm')));

await expectReject('unique SKU', async (tx) => {
  await tx.insert(productVariants).values({
    productId: probeProduct.id,
    sku: 'ZZ-PROBE-1',
    originalPrice: '10.00',
    currentPrice: '10.00',
  });
});

await expectReject('unique product slug', async (tx) => {
  await tx.insert(products).values({ slug: 'zz-probe-product', name: 'مكرر', categoryId: womenCat.id });
});

await expectReject('unique category slug', async (tx) => {
  await tx.insert(categories).values({ slug: 'women', name: 'مكرر' });
});

await expectReject('no negative stock', async (tx) => {
  await tx
    .update(productVariants)
    .set({ stockQuantity: -1 })
    .where(eq(productVariants.id, probeVariant.id));
});

await expectReject('variant prices positive', async (tx) => {
  await tx.insert(productVariants).values({
    productId: probeProduct.id,
    sku: 'ZZ-PROBE-2',
    originalPrice: '0.00',
    currentPrice: '10.00',
  });
});

// One size value attached, then a SECOND value of the SAME attribute — rejected.
await db
  .insert(variantAttributeValues)
  .values({ variantId: probeVariant.id, attributeValueId: sizeValM.id, attributeId: sizeAttr.id });
const [sizeValL] = await db
  .select({ id: attributeValues.id })
  .from(attributeValues)
  .where(and(eq(attributeValues.attributeId, sizeAttr.id), eq(attributeValues.slug, 'l')));

await expectReject('one value per attribute per variant', async (tx) => {
  await tx.insert(variantAttributeValues).values({
    variantId: probeVariant.id,
    attributeValueId: sizeValL.id,
    attributeId: sizeAttr.id,
  });
});

// Mismatched pair: color value id + size attribute id — composite FK must reject.
const [colorAttr] = await db
  .select({ id: attributes.id })
  .from(attributes)
  .where(eq(attributes.slug, 'color'));
const [colorValBlack] = await db
  .select({ id: attributeValues.id })
  .from(attributeValues)
  .where(and(eq(attributeValues.attributeId, colorAttr.id), eq(attributeValues.slug, 'black')));

await expectReject('value/attribute pair consistency (composite FK)', async (tx) => {
  await tx.insert(variantAttributeValues).values({
    variantId: probeVariant.id,
    attributeValueId: colorValBlack.id,
    attributeId: sizeAttr.id,
  });
});

await expectReject('order money identity (grand_total = products_total + shipping)', async (tx) => {
  const [c] = await tx
    .insert(customers)
    .values({ name: 'بروب', phone: '+20 100 000 0000', phoneNormalized: '+201000000000' })
    .returning({ id: customers.id });
  await tx.insert(orders).values({
    orderNumber: 'ZZ-PROBE-ORDER-1',
    customerId: c.id,
    productsTotal: '100.00',
    shippingCost: '20.00',
    grandTotal: '110.00', // WRONG on purpose (must be 120.00)
    addressSnapshot: 'عنوان تجريبي',
    customerNameSnapshot: 'بروب',
    customerPhoneSnapshot: '+201000000000',
    whatsappPhoneSnapshot: '+201019003677',
  });
});

await expectReject('order item quantity positive', async (tx) => {
  const [c] = await tx
    .insert(customers)
    .values({ name: 'بروب', phone: '+20 100 000 0001', phoneNormalized: '+201000000001' })
    .returning({ id: customers.id });
  const [o] = await tx
    .insert(orders)
    .values({
      orderNumber: 'ZZ-PROBE-ORDER-2',
      customerId: c.id,
      productsTotal: '90.00',
      grandTotal: '90.00',
      addressSnapshot: 'عنوان تجريبي',
      customerNameSnapshot: 'بروب',
      customerPhoneSnapshot: '+201000000001',
      whatsappPhoneSnapshot: '+201019003677',
    })
    .returning({ id: orders.id });
  await tx.insert(orderItems).values({
    orderId: o.id,
    productId: probeProduct.id,
    variantId: probeVariant.id,
    productNameSnapshot: 'بروب',
    variantAttributesSnapshot: [],
    skuSnapshot: 'ZZ-PROBE-1',
    originalUnitPriceSnapshot: '90.00',
    currentUnitPriceSnapshot: '90.00',
    unitPrice: '90.00',
    quantity: 0, // invalid on purpose
    subtotal: '0.00',
  });
});

await expectReject('order item subtotal identity (subtotal = unit_price × quantity)', async (tx) => {
  const [c] = await tx
    .insert(customers)
    .values({ name: 'بروب', phone: '+20 100 000 0002', phoneNormalized: '+201000000002' })
    .returning({ id: customers.id });
  const [o] = await tx
    .insert(orders)
    .values({
      orderNumber: 'ZZ-PROBE-ORDER-3',
      customerId: c.id,
      productsTotal: '180.00',
      grandTotal: '180.00',
      addressSnapshot: 'عنوان تجريبي',
      customerNameSnapshot: 'بروب',
      customerPhoneSnapshot: '+201000000002',
      whatsappPhoneSnapshot: '+201019003677',
    })
    .returning({ id: orders.id });
  await tx.insert(orderItems).values({
    orderId: o.id,
    productId: probeProduct.id,
    variantId: probeVariant.id,
    productNameSnapshot: 'بروب',
    variantAttributesSnapshot: [],
    skuSnapshot: 'ZZ-PROBE-1',
    originalUnitPriceSnapshot: '90.00',
    currentUnitPriceSnapshot: '90.00',
    unitPrice: '90.00',
    quantity: 2,
    subtotal: '100.00', // WRONG on purpose (must be 180.00)
  });
});

/* ---- Persisted probe state for the verified-review + inventory probes ---- */
const [probeCustomer] = await db
  .insert(customers)
  .values({ name: 'بروب', phone: '+20 100 000 0003', phoneNormalized: '+201000000003' })
  .returning({ id: customers.id });

const [probeOrder] = await db
  .insert(orders)
  .values({
    orderNumber: 'ZZ-PROBE-ORDER-4',
    customerId: probeCustomer.id,
    orderStatus: 'completed',
    shippingStatus: 'delivered',
    productsTotal: '90.00',
    grandTotal: '90.00',
    addressSnapshot: 'عنوان تجريبي',
    customerNameSnapshot: 'بروب',
    customerPhoneSnapshot: '+201000000003',
    whatsappPhoneSnapshot: '+201019003677',
  })
  .returning({ id: orders.id });

const [probeOrderItem] = await db
  .insert(orderItems)
  .values({
    orderId: probeOrder.id,
    productId: probeProduct.id,
    variantId: probeVariant.id,
    productNameSnapshot: 'بروب',
    variantAttributesSnapshot: [],
    skuSnapshot: 'ZZ-PROBE-1',
    originalUnitPriceSnapshot: '90.00',
    currentUnitPriceSnapshot: '90.00',
    unitPrice: '90.00',
    quantity: 1,
    subtotal: '90.00',
  })
  .returning({ id: orderItems.id });

await db.insert(reviews).values({
  productId: probeProduct.id,
  orderItemId: probeOrderItem.id,
  rating: 5,
  comment: 'تقييم موثق أول',
  status: 'approved',
  isVerifiedPurchase: true,
});

await expectReject('one verified review per order item', async (tx) => {
  await tx.insert(reviews).values({
    productId: probeProduct.id,
    orderItemId: probeOrderItem.id,
    rating: 4,
    comment: 'تقييم موثق مكرر',
    status: 'approved',
    isVerifiedPurchase: true,
  });
});

await expectReject('review rating must be 1..5', async (tx) => {
  await tx.insert(reviews).values({
    productId: probeProduct.id,
    rating: 6,
    comment: 'تقييم خارج النطاق',
  });
});

// Sale movement referencing the probe order (persisted), then the probes.
await db.insert(inventoryMovements).values({
  variantId: probeVariant.id,
  orderId: probeOrder.id,
  movementType: 'sale',
  quantityDelta: -1,
  stockBefore: 5,
  stockAfter: 4,
  reason: 'probe sale',
});

await expectReject('one cancellation-return per order (restore exactly once)', async (tx) => {
  // First return for this order already exists below? No — create it here, then
  // attempt a SECOND one; the unique partial index must stop the duplicate.
  await tx.insert(inventoryMovements).values({
    variantId: probeVariant.id,
    orderId: probeOrder.id,
    movementType: 'cancellation_return',
    quantityDelta: 1,
    stockBefore: 4,
    stockAfter: 5,
  });
  await tx.insert(inventoryMovements).values({
    variantId: probeVariant.id,
    orderId: probeOrder.id,
    movementType: 'cancellation_return',
    quantityDelta: 1,
    stockBefore: 5,
    stockAfter: 6,
  });
});

await expectReject('inventory ledger identity (after = before + delta)', async (tx) => {
  await tx.insert(inventoryMovements).values({
    variantId: probeVariant.id,
    movementType: 'manual_adjustment',
    quantityDelta: 2,
    stockBefore: 4,
    stockAfter: 5, // WRONG on purpose (must be 6)
  });
});

await expectReject('inventory ledger cannot record negative stock', async (tx) => {
  await tx.insert(inventoryMovements).values({
    variantId: probeVariant.id,
    movementType: 'sale',
    quantityDelta: -100,
    stockBefore: 4,
    stockAfter: -96,
  });
});

await expectReject('unique admin session token hash', async (tx) => {
  const [a] = await tx
    .insert(adminUsers)
    .values({ username: 'zz-probe-admin', passwordHash: 'probe-hash' })
    .returning({ id: adminUsers.id });
  await tx.insert(adminSessions).values({
    adminUserId: a.id,
    sessionTokenHash: 'probe-token-hash',
    expiresAt: new Date(Date.now() + 60_000),
  });
  await tx.insert(adminSessions).values({
    adminUserId: a.id,
    sessionTokenHash: 'probe-token-hash', // duplicate on purpose
    expiresAt: new Date(Date.now() + 120_000),
  });
});

await expectReject('store_settings is a singleton', async (tx) => {
  await tx.insert(storeSettings).values({
    id: 2,
    storeName: 'ثاني',
    whatsappPhone: '+201019003677',
    whatsappMessageTemplate: 'x',
  });
});

/* -------------------------------------------------------------------------- */
/* 4. FK-safe cleanup of persisted probe rows                                  */
/* -------------------------------------------------------------------------- */

await db
  .delete(inventoryMovements)
  .where(like(inventoryMovements.reason, 'probe%'));
await db
  .delete(inventoryMovements)
  .where(eq(inventoryMovements.orderId, probeOrder.id));
await db.delete(reviews).where(eq(reviews.productId, probeProduct.id));
await db.delete(orderItems).where(eq(orderItems.orderId, probeOrder.id));
await db.delete(orders).where(eq(orders.id, probeOrder.id));
await db.delete(customers).where(like(customers.phoneNormalized, '+201000000%'));
await db.delete(products).where(eq(products.id, probeProduct.id)); // cascades variants/assignments

{
  const leftover = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM products WHERE slug = 'zz-probe-product'`,
  );
  if (leftover.rows[0].n === 0) pass('probe cleanup left no residue');
  else fail('probe cleanup left no residue');
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                     */
/* -------------------------------------------------------------------------- */

console.log(`\n[db-verify] ${passes} passed, ${failures} failed`);
await getPool().end();
if (failures > 0) {
  console.error('[db-verify] FAILED — see errors above.');
  process.exit(1);
}
console.log('[db-verify] ALL CHECKS PASS');
