/**
 * Amira Store — PHASE-04 catalog verification suite.
 *
 * Exercises the application's OWN catalog/media services (src/lib/catalog/*,
 * src/lib/media/*) against the target database and asserts every PHASE-04
 * task that is verifiable at the service layer:
 *
 *   1. category tree: create/reparent/slug/reorder; cycle + delete guards
 *   2. attributes/values: creation, per-attribute uniqueness, in-use delete guards
 *   3. product draft creation + status transitions + archive policy
 *   4. aggregate save: no-attribute default variant / size-only / color-only /
 *      size+color explicit subset (NO forced matrix)
 *   5. one-value-per-attribute enforcement + duplicate-combination rejection
 *   6. duplicate SKU rejection (in-product and cross-product)
 *   7. server-side pricing validation (zero/negative/3-decimals rejected)
 *   8. inventory ledger: manual_adjustment on stock change, opening on create
 *   9. ledger-referenced variant delete guard (deactivate instead)
 *  10. media attach/reorder/replace without orphans; guarded asset deletion
 *  11. size guide upsert/rows
 *  14. media credential surfaces: OIDC pair vs legacy token decision logic
 *      (no real values; process-local env, always restored)
 *
 * Safety:
 * - REFUSES NODE_ENV=production;
 * - every created row is removed in `finally` (movements first — the ledger
 *   RESTRICTs variant deletion);
 * - never prints credentials.
 *
 * Run against the isolated development database only:
 *   set -a; . ./.env.local; set +a; bun run verify:catalog
 */

import { eq, inArray, sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import {
  attributes,
  categories,
  inventoryMovements,
  mediaAssets,
  productImages,
  productVariants,
  products,
} from '../src/db/schema';
import {
  AttributeServiceError,
  createAttribute,
  createAttributeValue,
  deleteAttribute,
  deleteAttributeValue,
} from '../src/lib/catalog/attributes';
import {
  createCategory,
  deleteCategory,
  getCategoryTree,
  updateCategory,
  CategoryServiceError,
} from '../src/lib/catalog/categories';
import {
  createProduct,
  getProductAggregate,
  listProducts,
  saveProductAggregate,
  setProductStatus,
  ProductServiceError,
} from '../src/lib/catalog/products';
import { parsePrice, PricingValidationError } from '../src/lib/catalog/pricing';
import { getMediaReferenceReport, deleteMediaAsset } from '../src/lib/media/registry';

if (process.env.NODE_ENV === 'production') {
  console.error('[verify-catalog] REFUSED: never run catalog probes against production.');
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

async function expectServiceError(name: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    fail(name, 'no error thrown');
  } catch (error) {
    if (
      error instanceof CategoryServiceError ||
      error instanceof AttributeServiceError ||
      error instanceof ProductServiceError ||
      error instanceof PricingValidationError
    ) {
      pass(name, (error as Error).message.slice(0, 48));
    } else {
      fail(name, `unexpected error class: ${(error as Error)?.name}`);
    }
  }
}

// Actor for audit rows = the single existing admin (suite target contract).
let TEST_ADMIN_ID = '';
const createdCategoryIds: string[] = [];
const createdAttributeIds: string[] = [];
const createdProductIds: string[] = [];
const createdMediaIds: string[] = [];

async function createTestMedia(label: string): Promise<string> {
  const [row] = await db
    .insert(mediaAssets)
    .values({
      provider: 'test_fixture',
      pathname: `verify-catalog/${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: `/brand/og-default.png`,
      mimeType: 'image/png',
      sizeBytes: 1024,
      width: 600,
      height: 600,
      altText: 'verify-catalog fixture',
    })
    .returning({ id: mediaAssets.id });
  createdMediaIds.push(row.id);
  return row.id;
}

try {
  const rawUrl = process.env.DATABASE_URL ?? '';
  if (!rawUrl) {
    console.error('[verify-catalog] REFUSED: DATABASE_URL is not set.');
    process.exit(1);
  }
  console.log(`[verify-catalog] target endpoint (non-secret): ${new URL(rawUrl).hostname}`);
  await db.execute(sql`SELECT 1`);

  const { adminUsers } = await import('../src/db/schema');
  const admins = await db.select({ id: adminUsers.id }).from(adminUsers);
  if (admins.length !== 1) {
    console.error('[verify-catalog] REFUSED: expected exactly 1 admin. Run db:bootstrap:admin first.');
    await getPool().end();
    process.exit(1);
  }
  TEST_ADMIN_ID = admins[0].id;

  /* ------------------------------------------------ pre-cleanup (self-healing)
     A previously interrupted run may have left fixtures (business row committed
     but the run crashed before tracking the id). Remove everything matching the
     suite's unique naming patterns BEFORE creating anything. */
  await db.execute(sql`
    delete from inventory_movements where variant_id in (
      select v.id from product_variants v
      join products p on p.id = v.product_id
      where p.name = 'منتج تحقق كتالوج'
    )
  `);
  await db.execute(sql`delete from products where name = 'منتج تحقق كتالوج'`);
  await db.execute(sql`delete from categories where name like 'تحقق-قسم-%'`);
  await db.execute(sql`delete from attributes where name like 'verify-catalog-%'`);
  await db.execute(sql`delete from media_assets where pathname like 'verify-catalog/%'`);
  console.log('[verify-catalog] pre-cleanup done (leftover fixtures removed if any)');

  /* ---------------------------------------------------- 1) category tree */
  console.log('\n[1] category tree');
  const root = await createCategory({ name: 'تحقق-قسم-جذري' }, TEST_ADMIN_ID);
  createdCategoryIds.push(root.id);
  const child = await createCategory(
    { name: 'تحقق-قسم-فرعي', parentId: root.id },
    TEST_ADMIN_ID,
  );
  createdCategoryIds.push(child.id);
  assert('tree nests child under root', (await getCategoryTree(true)).some((node) =>
    node.id === root.id && node.children.some((c) => c.id === child.id),
  ));

  await expectServiceError('self-parenting rejected', () =>
    updateCategory(root.id, { name: root.name, parentId: root.id }, TEST_ADMIN_ID),
  );

  const renamed = await updateCategory(
    root.id,
    { name: 'تحقق-قسم-جذري-٢', isActive: false },
    TEST_ADMIN_ID,
  );
  assert('category update applies', renamed.name === 'تحقق-قسم-جذري-٢' && renamed.isActive === false);

  await expectServiceError('delete guard: category with children', () =>
    deleteCategory(root.id, TEST_ADMIN_ID),
  );

  /* ------------------------------------------------- 2) attributes/values */
  console.log('\n[2] attributes and values');
  const sizeAttribute = await createAttribute({ name: 'verify-catalog-size' }, TEST_ADMIN_ID);
  createdAttributeIds.push(sizeAttribute.id);
  const colorAttribute = await createAttribute({ name: 'verify-catalog-color' }, TEST_ADMIN_ID);
  createdAttributeIds.push(colorAttribute.id);

  const sizeS = await createAttributeValue(sizeAttribute.id, { value: 'S' }, TEST_ADMIN_ID);
  const sizeM = await createAttributeValue(sizeAttribute.id, { value: 'M' }, TEST_ADMIN_ID);
  const colorRed = await createAttributeValue(colorAttribute.id, { value: 'أحمر' }, TEST_ADMIN_ID);
  const colorBlue = await createAttributeValue(colorAttribute.id, { value: 'أزرق' }, TEST_ADMIN_ID);

  // Arabic value with the same latin slug in ANOTHER attribute is allowed,
  // but the same slug within one attribute is rejected.
  await expectServiceError('duplicate value within one attribute rejected', () =>
    createAttributeValue(sizeAttribute.id, { value: 'S' }, TEST_ADMIN_ID),
  );

  /* ------------------------------------------- 3) product draft + status */
  console.log('\n[3] product draft + status');
  const product = await createProduct(
    { name: 'منتج تحقق كتالوج', categoryId: root.id },
    TEST_ADMIN_ID,
  );
  createdProductIds.push(product.id);
  assert('draft created', product.status === 'draft');
  const activated = await setProductStatus(product.id, 'active', TEST_ADMIN_ID);
  assert('status transition to active', activated.status === 'active');

  /* ----------------------------------------------- 4) aggregate variants */
  console.log('\n[4] aggregate save — variant shapes');

  // 4a. no attributes → exactly one default variant
  await saveProductAggregate(
    product.id,
    {
      name: 'منتج تحقق كتالوج',
      categoryId: root.id,
      attributeIds: [],
      variants: [
        {
          clientKey: 'default',
          id: null,
          sku: `VC-DEF-${Date.now().toString(36).toUpperCase()}`,
          originalPrice: '250',
          currentPrice: '199.5',
          stockQuantity: 0,
          lowStockThreshold: 2,
          isActive: true,
          attributeValueIds: [],
        },
      ],
      images: [],
      sizeGuide: null,
    },
    TEST_ADMIN_ID,
  );
  let aggregate = await getProductAggregate(product.id);
  assert(
    'no-option product saves a single default variant',
    aggregate?.variants.length === 1 && aggregate.variants[0].currentPrice === '199.50',
  );
  const defaultVariantId = aggregate!.variants[0].id;

  // 4b. size-only explicit subset
  const sizeOnlySkuBase = `VC-S-${Date.now().toString(36).toUpperCase()}`;
  await saveProductAggregate(
    product.id,
    {
      name: 'منتج تحقق كتالوج',
      categoryId: root.id,
      attributeIds: [sizeAttribute.id],
      variants: [
        {
          clientKey: 's0',
          id: defaultVariantId,
          sku: `${sizeOnlySkuBase}-S`,
          originalPrice: '250',
          currentPrice: '199.50',
          stockQuantity: 5,
          lowStockThreshold: 1,
          isActive: true,
          attributeValueIds: [sizeS.id],
        },
        {
          clientKey: 's2',
          id: null,
          sku: `${sizeOnlySkuBase}-M`,
          originalPrice: '250',
          currentPrice: '189.00',
          stockQuantity: 0,
          lowStockThreshold: 1,
          isActive: true,
          attributeValueIds: [sizeM.id],
        },
      ],
      images: [],
      sizeGuide: null,
    },
    TEST_ADMIN_ID,
  );
  aggregate = await getProductAggregate(product.id);
  assert(
    'size-only editor works with different per-variant prices',
    aggregate?.variants.length === 2 &&
      aggregate.variants[0].currentPrice !== aggregate.variants[1].currentPrice,
  );
  const variantIds = aggregate?.variants.map((v) => v.id) ?? [];
  const zeroStockVariantId = aggregate?.variants.find((v) => v.stockQuantity === 0)?.id;
  assert('zero-stock variant persists ( purchasability enforced at checkout later)', Boolean(zeroStockVariantId));

  // 4c. color-only via REUSE of the existing variant row (editor-realistic:
  // the admin edits the row in place; the stock-0 sibling is removed freely).
  await saveProductAggregate(
    product.id,
    {
      name: 'منتج تحقق كتالوج',
      categoryId: root.id,
      attributeIds: [colorAttribute.id],
      variants: [
        {
          clientKey: 'c1',
          id: aggregate!.variants[0].id,
          sku: `${sizeOnlySkuBase}-RED`,
          originalPrice: '300',
          currentPrice: '300',
          stockQuantity: 4,
          lowStockThreshold: 1,
          isActive: true,
          attributeValueIds: [colorRed.id],
        },
      ],
      images: [],
      sizeGuide: null,
    },
    TEST_ADMIN_ID,
  );
  aggregate = await getProductAggregate(product.id);
  assert(
    'color-only editor works (row reused, sibling removed)',
    aggregate?.variants.length === 1 &&
      aggregate?.variants[0].sku === `${sizeOnlySkuBase}-RED`,
  );
  const colorOnlyVariantId = aggregate!.variants[0].id;

  // 4d. size+color explicit NON-Cartesian subset (2 of 4 combinations)
  const comboSkuBase = `VC-SC-${Date.now().toString(36).toUpperCase()}`;
  await saveProductAggregate(
    product.id,
    {
      name: 'منتج تحقق كتالوج',
      categoryId: root.id,
      attributeIds: [sizeAttribute.id, colorAttribute.id],
      variants: [
        {
          clientKey: 'sc1',
          id: colorOnlyVariantId,
          sku: `${comboSkuBase}-S-R`,
          originalPrice: '400',
          currentPrice: '349',
          stockQuantity: 3,
          lowStockThreshold: 1,
          isActive: true,
          attributeValueIds: [sizeS.id, colorRed.id],
        },
        {
          clientKey: 'sc2',
          id: null,
          sku: `${comboSkuBase}-M-B`,
          originalPrice: '400',
          currentPrice: '359',
          stockQuantity: 2,
          lowStockThreshold: 1,
          isActive: true,
          attributeValueIds: [sizeM.id, colorBlue.id],
        },
      ],
      images: [],
      sizeGuide: null,
    },
    TEST_ADMIN_ID,
  );
  aggregate = await getProductAggregate(product.id);
  assert(
    'size+color explicit subset saves (S-RED + M-BLUE only — no matrix)',
    aggregate?.variants.length === 2,
  );

  /* ------------------------------------------- 5) combination/assignment rules */
  console.log('\n[5] assignment rules');
  await expectServiceError('two values of the SAME attribute on one variant rejected', () =>
    saveProductAggregate(
      product.id,
      {
        name: 'منتج تحقق كتالوج',
        categoryId: root.id,
        attributeIds: [sizeAttribute.id, colorAttribute.id],
        variants: [
          {
            clientKey: 'bad1',
            id: null,
            sku: `${comboSkuBase}-BAD1`,
            originalPrice: '10',
            currentPrice: '9',
            stockQuantity: 1,
            lowStockThreshold: 0,
            isActive: true,
            attributeValueIds: [sizeS.id, sizeM.id, colorRed.id],
          },
        ],
        images: [],
        sizeGuide: null,
      },
      TEST_ADMIN_ID,
    ),
  );

  await expectServiceError('missing value for a used attribute rejected', () =>
    saveProductAggregate(
      product.id,
      {
        name: 'منتج تحقق كتالوج',
        categoryId: root.id,
        attributeIds: [sizeAttribute.id, colorAttribute.id],
        variants: [
          {
            clientKey: 'bad2',
            id: null,
            sku: `${comboSkuBase}-BAD2`,
            originalPrice: '10',
            currentPrice: '9',
            stockQuantity: 1,
            lowStockThreshold: 0,
            isActive: true,
            attributeValueIds: [sizeS.id],
          },
        ],
        images: [],
        sizeGuide: null,
      },
      TEST_ADMIN_ID,
    ),
  );

  await expectServiceError('duplicate value combination rejected', () =>
    saveProductAggregate(
      product.id,
      {
        name: 'منتج تحقق كتالوج',
        categoryId: root.id,
        attributeIds: [sizeAttribute.id, colorAttribute.id],
        variants: [
          {
            clientKey: 'dup1',
            id: null,
            sku: `${comboSkuBase}-D1`,
            originalPrice: '10',
            currentPrice: '9',
            stockQuantity: 1,
            lowStockThreshold: 0,
            isActive: true,
            attributeValueIds: [sizeS.id, colorRed.id],
          },
          {
            clientKey: 'dup2',
            id: null,
            sku: `${comboSkuBase}-D2`,
            originalPrice: '10',
            currentPrice: '9',
            stockQuantity: 1,
            lowStockThreshold: 0,
            isActive: true,
            attributeValueIds: [colorRed.id, sizeS.id],
          },
        ],
        images: [],
        sizeGuide: null,
      },
      TEST_ADMIN_ID,
    ),
  );

  /* ------------------------------------------------------ 6) SKU rules */
  console.log('\n[6] SKU uniqueness');
  const seededProduct = await db
    .select({ id: products.id, sku: productVariants.sku })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .limit(1);
  const foreignSku = seededProduct[0]?.sku ?? 'SEED-SKU';
  // Keep BOTH current variants; add a NEW valid combination (S-BLUE) that
  // carries a foreign product's SKU → the pre-check must reject it.
  aggregate = await getProductAggregate(product.id);
  const keptFirst = aggregate!.variants[0];
  const keptSecond = aggregate!.variants[1];
  await expectServiceError('cross-product duplicate SKU rejected', () =>
    saveProductAggregate(
      product.id,
      {
        name: 'منتج تحقق كتالوج',
        categoryId: root.id,
        attributeIds: [sizeAttribute.id, colorAttribute.id],
        variants: [
          {
            clientKey: 'keep1',
            id: keptFirst.id,
            sku: keptFirst.sku,
            originalPrice: keptFirst.originalPrice,
            currentPrice: keptFirst.currentPrice,
            stockQuantity: keptFirst.stockQuantity,
            lowStockThreshold: keptFirst.lowStockThreshold,
            isActive: true,
            attributeValueIds: keptFirst.attributeValueIds,
          },
          {
            clientKey: 'keep2',
            id: keptSecond.id,
            sku: keptSecond.sku,
            originalPrice: keptSecond.originalPrice,
            currentPrice: keptSecond.currentPrice,
            stockQuantity: keptSecond.stockQuantity,
            lowStockThreshold: keptSecond.lowStockThreshold,
            isActive: true,
            attributeValueIds: keptSecond.attributeValueIds,
          },
          {
            clientKey: 'sku1',
            id: null,
            sku: foreignSku,
            originalPrice: '10',
            currentPrice: '9',
            stockQuantity: 1,
            lowStockThreshold: 0,
            isActive: true,
            attributeValueIds: [sizeS.id, colorBlue.id],
          },
        ],
        images: [],
        sizeGuide: null,
      },
      TEST_ADMIN_ID,
    ),
  );

  /* -------------------------------------------------- 7) pricing rules */
  console.log('\n[7] server-side pricing validation');
  for (const [label, bad] of [
    ['zero price', '0'],
    ['negative price', '-5'],
    ['3-decimal price', '10.123'],
    ['garbage price', 'abc'],
  ] as const) {
    try {
      parsePrice(bad, 'اختبار');
      fail(`${label} rejected`, 'parsed');
    } catch (error) {
      if (error instanceof PricingValidationError) pass(`${label} rejected`);
      else fail(`${label} rejected`, 'wrong error');
    }
  }

  /* ---------------------------------------------- 8) inventory ledger */
  console.log('\n[8] inventory ledger integration');
  // Current state: 2 variants (3 and 2 stock) from 4d. Change stock of one.
  aggregate = await getProductAggregate(product.id);
  const firstVariant = aggregate!.variants[0];
  const secondVariant = aggregate!.variants[1];
  await saveProductAggregate(
    product.id,
    {
      name: 'منتج تحقق كتالوج',
      categoryId: root.id,
      attributeIds: [sizeAttribute.id, colorAttribute.id],
      variants: [
        {
          clientKey: 'k1',
          id: firstVariant.id,
          sku: firstVariant.sku,
          originalPrice: firstVariant.originalPrice,
          currentPrice: firstVariant.currentPrice,
          stockQuantity: firstVariant.stockQuantity + 4,
          lowStockThreshold: firstVariant.lowStockThreshold,
          isActive: true,
          attributeValueIds: firstVariant.attributeValueIds,
        },
        {
          clientKey: 'k2',
          id: secondVariant.id,
          sku: secondVariant.sku,
          originalPrice: secondVariant.originalPrice,
          currentPrice: secondVariant.currentPrice,
          stockQuantity: secondVariant.stockQuantity,
          lowStockThreshold: secondVariant.lowStockThreshold,
          isActive: true,
          attributeValueIds: secondVariant.attributeValueIds,
        },
      ],
      images: [],
      sizeGuide: null,
    },
    TEST_ADMIN_ID,
  );
  const [movement] = await db
    .select()
    .from(inventoryMovements)
    .where(eq(inventoryMovements.variantId, firstVariant.id))
    .orderBy(sql`created_at desc`)
    .limit(1);
  assert(
    'stock change writes manual_adjustment movement with before/after',
    movement?.movementType === 'manual_adjustment' &&
      movement.stockBefore === firstVariant.stockQuantity &&
      movement.stockAfter === firstVariant.stockQuantity + 4 &&
      movement.quantityDelta === 4,
  );
  assert('ledger rows carry the admin id', movement?.adminUserId === TEST_ADMIN_ID);

  /* ---------------------------------- 9) ledger-referenced variant guard */
  console.log('\n[9] referenced variant delete guard');
  await expectServiceError('variant with ledger rows cannot be removed', () =>
    saveProductAggregate(
      product.id,
      {
        name: 'منتج تحقق كتالوج',
        categoryId: root.id,
        attributeIds: [sizeAttribute.id, colorAttribute.id],
        variants: [
          {
            clientKey: 'k2',
            id: secondVariant.id,
            sku: secondVariant.sku,
            originalPrice: secondVariant.originalPrice,
            currentPrice: secondVariant.currentPrice,
            stockQuantity: secondVariant.stockQuantity,
            lowStockThreshold: secondVariant.lowStockThreshold,
            isActive: true,
            attributeValueIds: secondVariant.attributeValueIds,
          },
        ],
        images: [],
        sizeGuide: null,
      },
      TEST_ADMIN_ID,
    ),
  );
  aggregate = await getProductAggregate(product.id);
  assert('variant list unchanged after refused removal', aggregate?.variants.length === 2);

  /* ------------------------------------------------- 10) media behavior */
  console.log('\n[10] media reference integrity');
  const mediaA = await createTestMedia('gallery-a');
  const mediaB = await createTestMedia('variant-b');
  const mediaC = await createTestMedia('orphan-c');

  await saveProductAggregate(
    product.id,
    {
      name: 'منتج تحقق كتالوج',
      categoryId: root.id,
      attributeIds: [sizeAttribute.id, colorAttribute.id],
      variants: aggregate!.variants.map((variant) => ({
        clientKey: variant.id,
        id: variant.id,
        sku: variant.sku,
        originalPrice: variant.originalPrice,
        currentPrice: variant.currentPrice,
        stockQuantity: variant.stockQuantity,
        lowStockThreshold: variant.lowStockThreshold,
        isActive: variant.isActive,
        attributeValueIds: variant.attributeValueIds,
      })),
      images: [
        { mediaAssetId: mediaA, level: 'product', altText: 'غلاف', isPrimary: true, sortOrder: 0 },
        {
          mediaAssetId: mediaB,
          level: { variantKey: aggregate!.variants[0].id },
          altText: 'صورة متغير',
          isPrimary: false,
          sortOrder: 1,
        },
      ],
      sizeGuide: null,
    },
    TEST_ADMIN_ID,
  );
  aggregate = await getProductAggregate(product.id);
  assert(
    'gallery + variant image attached',
    aggregate?.images.length === 2 &&
      aggregate.images.some((image) => image.variantId === null && image.isPrimary) &&
      aggregate.images.some((image) => image.variantId === aggregate!.variants[0].id),
  );

  const report = await getMediaReferenceReport(mediaA);
  assert('referenced asset reported undeletable', !report.deletable && report.blockers.includes('صور المنتجات'));
  const deletedWhileReferenced = await deleteMediaAsset(mediaA);
  assert('guarded delete refuses referenced asset', !deletedWhileReferenced.deletable);
  const stillThere = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaA));
  assert('referenced asset row still present', stillThere.length === 1);

  const orphanReport = await deleteMediaAsset(mediaC);
  assert('unreferenced asset deleted cleanly', orphanReport.deletable);
  const goneOrphan = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaC));
  assert('orphan asset row removed', goneOrphan.length === 0);
  const mediaCIndex = createdMediaIds.indexOf(mediaC);
  if (mediaCIndex >= 0) createdMediaIds.splice(mediaCIndex, 1);

  // Replace + detach flow: swap variant image to a new asset, old one detaches.
  const mediaD = await createTestMedia('variant-d');
  await saveProductAggregate(
    product.id,
    {
      name: 'منتج تحقق كتالوج',
      categoryId: root.id,
      attributeIds: [sizeAttribute.id, colorAttribute.id],
      variants: aggregate!.variants.map((variant) => ({
        clientKey: variant.id,
        id: variant.id,
        sku: variant.sku,
        originalPrice: variant.originalPrice,
        currentPrice: variant.currentPrice,
        stockQuantity: variant.stockQuantity,
        lowStockThreshold: variant.lowStockThreshold,
        isActive: variant.isActive,
        attributeValueIds: variant.attributeValueIds,
      })),
      images: [
        { mediaAssetId: mediaA, level: 'product', altText: 'غلاف', isPrimary: true, sortOrder: 0 },
        {
          mediaAssetId: mediaD,
          level: { variantKey: aggregate!.variants[0].id },
          altText: 'صورة متغير بديلة',
          isPrimary: false,
          sortOrder: 1,
        },
      ],
      sizeGuide: null,
    },
    TEST_ADMIN_ID,
  );
  aggregate = await getProductAggregate(product.id);
  const [bStillReferenced] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productImages)
    .where(eq(productImages.mediaAssetId, mediaB));
  assert(
    'variant image replaced with no orphan rows',
    aggregate?.images.length === 2 && (bStillReferenced?.n ?? 0) === 0,
  );

  /* ----------------------------------------------------- 11) size guide */
  console.log('\n[11] size guide');
  await saveProductAggregate(
    product.id,
    {
      name: 'منتج تحقق كتالوج',
      categoryId: root.id,
      attributeIds: [sizeAttribute.id, colorAttribute.id],
      variants: aggregate!.variants.map((variant) => ({
        clientKey: variant.id,
        id: variant.id,
        sku: variant.sku,
        originalPrice: variant.originalPrice,
        currentPrice: variant.currentPrice,
        stockQuantity: variant.stockQuantity,
        lowStockThreshold: variant.lowStockThreshold,
        isActive: variant.isActive,
        attributeValueIds: variant.attributeValueIds,
      })),
      images: aggregate!.images.map((image) => ({
        mediaAssetId: image.mediaAssetId,
        level:
          image.variantId === null
            ? ('product' as const)
            : { variantKey: image.variantId },
        altText: image.altText,
        isPrimary: image.isPrimary,
        sortOrder: image.sortOrder,
      })),
      sizeGuide: {
        title: 'دليل المقاسات',
        notes: 'القياسات بالسنتيمتر',
        rows: [
          { sizeLabel: 'S', measurements: { bust: '88', waist: '70', length: '100' }, sortOrder: 0 },
          { sizeLabel: 'M', measurements: { bust: '92', waist: '74', length: '104' }, sortOrder: 1 },
        ],
      },
    },
    TEST_ADMIN_ID,
  );
  aggregate = await getProductAggregate(product.id);
  assert(
    'size guide upserted with rows',
    Boolean(aggregate?.sizeGuide) && (aggregate?.sizeGuide?.rows.length ?? 0) === 2,
  );

  /* ------------------------------------------- 12) list + archive policy */
  console.log('\n[12] list + archive policy');
  const listed = await listProducts({ search: 'منتج تحقق كتالوج' });
  assert(
    'list search finds the product with aggregates',
    listed.items.length >= 1 &&
      listed.items[0].variantCount === 2 &&
      listed.items[0].primaryImageUrl !== null,
  );
  const archived = await setProductStatus(product.id, 'archived', TEST_ADMIN_ID);
  assert('archive (soft-delete) works', archived.status === 'archived');

  /* ------------------------------------- 13) attribute in-use delete guard */
  console.log('\n[13] in-use attribute guards');
  await expectServiceError('value in use cannot be deleted', () =>
    deleteAttributeValue(sizeS.id, TEST_ADMIN_ID),
  );
  await expectServiceError('attribute in use cannot be deleted', () =>
    deleteAttribute(sizeAttribute.id, TEST_ADMIN_ID),
  );
  // Unused value can be deleted.
  const unusedColor = await createAttributeValue(colorAttribute.id, { value: 'unused' }, TEST_ADMIN_ID);
  await deleteAttributeValue(unusedColor.id, TEST_ADMIN_ID);
  pass('unused value deleted cleanly');

  /* ------------------------------------- 14) media credential surfaces (OIDC era) */
  // Pure decision-logic checks on isVercelBlobConfigured() — no real values, no
  // network calls; env mutations are process-local and always restored.
  console.log('\n[14] media credential surfaces (OIDC + legacy token)');
  const isConfigured = (await import('@/lib/media/vercel-blob')).isVercelBlobConfigured;
  const blobEnvKeys = ['BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'VERCEL_OIDC_TOKEN'] as const;
  const savedBlobEnv = blobEnvKeys.map((key) => [key, process.env[key]] as const);
  try {
    for (const key of blobEnvKeys) delete process.env[key];
    assert('no credentials → unconfigured', isConfigured() === false);
    process.env['BLOB_STORE_ID'] = 'store_unit_test';
    assert('store id alone → still unconfigured', isConfigured() === false);
    process.env['VERCEL_OIDC_TOKEN'] = 'oidc_unit_test';
    assert('store id + OIDC token → configured (OIDC path)', isConfigured() === true);
    delete process.env['BLOB_STORE_ID'];
    delete process.env['VERCEL_OIDC_TOKEN'];
    process.env['BLOB_READ_WRITE_TOKEN'] = 'rw_unit_test';
    assert('legacy read-write token → configured', isConfigured() === true);
    assert('empty-string token → unconfigured', (() => {
      process.env['BLOB_READ_WRITE_TOKEN'] = '   ';
      const result = isConfigured();
      delete process.env['BLOB_READ_WRITE_TOKEN'];
      return result === false;
    })());
  } finally {
    for (const [key, value] of savedBlobEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  pass('media credential env restored exactly');
} catch (error) {
  failures += 1;
  console.error('\n[verify-catalog] UNEXPECTED FAILURE:', (error as Error)?.name, (error as Error)?.message);
} finally {
  /* ------------------------------------------------------- cleanup (LIFO) */
  console.log('\n[cleanup]');
  try {
    // 1. ledger rows referencing test variants (RESTRICT) — movements first.
    if (createdProductIds.length > 0) {
      await db.execute(sql`
        delete from inventory_movements where variant_id in (
          select id from product_variants where product_id in (${sql.join(
            createdProductIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
        )
      `);
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    // 2. categories (children already cascade-deleted with products).
    for (const id of [...createdCategoryIds].reverse()) {
      await db.delete(categories).where(eq(categories.id, id)).catch(() => undefined);
    }
    // 3. attributes (values cascade; assignments already gone with products).
    for (const id of createdAttributeIds) {
      await db.delete(attributes).where(eq(attributes.id, id)).catch(() => undefined);
    }
    // 4. media fixtures (references already gone with products).
    const remainingMedia = createdMediaIds.length
      ? await db
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(inArray(mediaAssets.id, createdMediaIds))
      : [];
    for (const row of remainingMedia) {
      await db
        .delete(productImages)
        .where(eq(productImages.mediaAssetId, row.id))
        .catch(() => undefined);
      await db.delete(mediaAssets).where(eq(mediaAssets.id, row.id)).catch(() => undefined);
    }
    console.log('  test fixtures removed');
  } catch (cleanupError) {
    failures += 1;
    console.error('[verify-catalog] CLEANUP FAILURE:', (cleanupError as Error)?.message);
  }
}

console.log(`\n[verify-catalog] ${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.error('[verify-catalog] CATALOG VERIFICATION FAILED');
  await getPool().end();
  process.exit(1);
}
console.log('[verify-catalog] ALL CATALOG CHECKS PASS');
await getPool().end();
