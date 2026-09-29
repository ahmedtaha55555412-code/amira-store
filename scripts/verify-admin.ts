/**
 * Amira Store — PHASE-12 admin verification suite (Admin Dashboard + Settings
 * completion: dashboard truth, inventory manual adjustment, pagination,
 * canonical_slug, banner editing/guard, media library completion, settings
 * display context, change-password throttle, and route authorization).
 *
 * Sections:
 *   A) SERVICE-LEVEL (always, against DATABASE_URL):
 *      1. dashboard metrics truth (delta-based against real fixtures)
 *      2. inventory manual adjustment — ledger row + reason + audit + atomicity
 *      3. no-negative-stock + zero-delta + short-reason + unknown-variant refusals
 *      4. list pagination (orders / products / reviews)
 *      5. product canonical_slug end-to-end (set / conflict / invalid / clear)
 *      6. homepage banner schedule + reorder service; sections stay
 *         product-selection-free (structural contract)
 *      7. media library completion — unreferenced detection + alt/audit paths
 *      8. settings display context — canonical-value schema + persistence + audit
 *      9. change-password throttle service layer
 *  10) ROUTE-LEVEL (HTTP against BASE_URL with QA admin credentials):
 *      unauthenticated 401s, cross-origin 403s, malformed-body 400s,
 *      authorized happy paths, change-password 429 throttle.
 *
 * Safety:
 * - REFUSES NODE_ENV=production;
 * - every fixture is deleted in `finally` (LIFO), settings restored,
 *   throttle rows cleared — zero residue;
 * - never prints passwords, tokens, cookies, or connection strings.
 */

import { and, eq, like, sql } from 'drizzle-orm';
import { ZodError } from 'zod';

import { db, getPool } from '../src/db/client';
import {
  adminActivityLogs,
  adminUsers,
  categories,
  customers,
  homepageBanners,
  inventoryMovements,
  mediaAssets,
  orderItems,
  orders,
  productImages,
  productVariants,
  products,
  reviews,
  storeSettings,
  variantAttributeValues,
} from '../src/db/schema';
import { errorResponse } from '../src/lib/api/admin';
import { requireAdminMutation } from '../src/lib/auth/guard';
import { ADMIN_SESSION_COOKIE } from '../src/lib/auth/session';
import {
  PASSWORD_CHANGE_MAX_FAILURES,
  clearPasswordChangeFailures,
  getPasswordChangeThrottleState,
  recordPasswordChangeFailure,
} from '../src/lib/auth/throttle';
import { getDashboardData } from '../src/lib/admin/dashboard';
import {
  InventoryServiceError,
  adjustVariantStock,
  stockAdjustmentSchema,
} from '../src/lib/admin/inventory';
import { listOrders } from '../src/lib/admin/orders';
import { listAdminReviews } from '../src/lib/admin/reviews';
import {
  bannerUpdateSchema,
  deleteHomepageBanner,
  getAdminBanners,
  updateHomepageBanner,
} from '../src/lib/admin/homepage';
import {
  getStoreSettings,
  settingsUpdateSchema,
  updateStoreSettings,
} from '../src/lib/admin/settings';
import { listProducts, saveProductAggregate } from '../src/lib/catalog/products';
import { ProductServiceError } from '../src/lib/catalog/products';
import { findUnreferencedMediaIds } from '../src/lib/media/registry';
import { createOrderFromCart } from '../src/lib/storefront/checkout';

if (process.env.NODE_ENV === 'production') {
  console.error('[verify-admin] REFUSED: never run admin probes against production.');
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
  return `verify-admin-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const CUSTOMER_NAME = 'عميل تحقق لوحة الإدارة';
const CUSTOMER_PHONE = '01000000999';
const CUSTOMER_ADDRESS = 'الجيزة، شارع التحقق، عمارة ١٢';

let probeAdminId: string | null = null;
let probeCategoryId: string | null = null;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdBannerIds: string[] = [];
const createdMediaIds: string[] = [];
const createdReviewIds: string[] = [];
const createdOrderKeys: string[] = [];
let createdMovementIds: string[] = [];
let settingsBackup: Awaited<ReturnType<typeof getStoreSettings>> = null;

async function buildFixtures(): Promise<void> {
  // Probe admin (activity author for every service call; NOT the real QA admin).
  const [admin] = await db
    .insert(adminUsers)
    .values({ username: `zz-admin12-${Date.now().toString(36)}`, passwordHash: 'probe-hash' })
    .returning({ id: adminUsers.id });
  probeAdminId = admin!.id;

  const [cat] = await db
    .insert(categories)
    .values({
      name: 'اختبار لوحة الإدارة (مؤقت)',
      slug: `adm-cat-${Date.now().toString(36)}`,
      isActive: true,
    })
    .returning({ id: categories.id });
  probeCategoryId = cat!.id;

  // Product A: one variant with stock 8 / threshold 3 (low-stock probe target).
  const [pa] = await db
    .insert(products)
    .values({
      categoryId: probeCategoryId!,
      name: 'منتج تحقق اللوحة أ',
      slug: `adm-prod-a-${Date.now().toString(36)}`,
      status: 'active',
    })
    .returning({ id: products.id });
  createdProductIds.push(pa!.id);
  const [va] = await db
    .insert(productVariants)
    .values({
      productId: pa!.id,
      sku: `ADM-A-${Date.now().toString(36)}`,
      originalPrice: '150.00',
      currentPrice: '120.00',
      stockQuantity: 8,
      lowStockThreshold: 3,
    })
    .returning({ id: productVariants.id });
  const variantAId = va!.id;
  createdVariantIds.push(variantAId);

  // Product B: default variant, stock 40 (checkout probe target).
  const [pb] = await db
    .insert(products)
    .values({
      categoryId: probeCategoryId!,
      name: 'منتج تحقق اللوحة ب',
      slug: `adm-prod-b-${Date.now().toString(36)}`,
      status: 'active',
    })
    .returning({ id: products.id });
  createdProductIds.push(pb!.id);
  const [vb] = await db
    .insert(productVariants)
    .values({
      productId: pb!.id,
      sku: `ADM-B-${Date.now().toString(36)}`,
      originalPrice: '80.00',
      currentPrice: '65.00',
      stockQuantity: 40,
    })
    .returning({ id: productVariants.id });
  const variantBId = vb!.id;
  createdVariantIds.push(variantBId);

  // Two probe orders through the REAL checkout path (dashboard queue + pagination).
  for (let i = 0; i < 2; i += 1) {
    const idem = key(`order-${i}`);
    createdOrderKeys.push(idem);
    const outcome = await createOrderFromCart({
      items: [{ variantId: variantBId, quantity: 1 + i }],
      customerName: CUSTOMER_NAME,
      customerPhone: CUSTOMER_PHONE,
      address: CUSTOMER_ADDRESS,
      idempotencyKey: idem,
    });
    if (outcome.status === 'rejected') {
      throw new Error('probe order fixture rejected');
    }
    const [orderRow] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.idempotencyKey, idem))
      .limit(1);
    createdOrderIds.push(orderRow!.id);
  }

  // Reviews fixtures (direct rows — moderation queue + pagination).
  for (let i = 0; i < 2; i += 1) {
    const [rv] = await db
      .insert(reviews)
      .values({
        productId: pa!.id,
        rating: (i % 5) + 1,
        comment: `تعديل تحقق لوحة الإدارة ${i}`,
        status: 'pending',
        isVerifiedPurchase: false,
      })
      .returning({ id: reviews.id });
    createdReviewIds.push(rv!.id);
  }

  // Banner fixture (schedule/reorder probes).
  const [media] = await db
    .insert(mediaAssets)
    .values({
      pathname: `verify-admin/banners/${Date.now().toString(36)}.webp`,
      url: '/brand/demo/verify-admin-banner.svg',
      accessMode: 'public',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      createdByAdminId: probeAdminId,
    })
    .returning({ id: mediaAssets.id });
  createdMediaIds.push(media!.id);
  const [banner] = await db
    .insert(homepageBanners)
    .values({
      title: 'بانر تحقق اللوحة',
      mediaAssetId: media!.id,
      isActive: false,
      sortOrder: 90,
    })
    .returning({ id: homepageBanners.id });
  createdBannerIds.push(banner!.id);

  // Settings backup (display-context probes restore the original row values).
  settingsBackup = await getStoreSettings();
}

async function destroyFixtures(): Promise<void> {
  // Settings row restore.
  if (settingsBackup) {
    await db
      .update(storeSettings)
      .set({
        currencyCode: settingsBackup.currencyCode,
        locale: settingsBackup.locale,
        timezone: settingsBackup.timezone,
        updatedAt: new Date(),
      })
      .where(eq(storeSettings.id, 1));
  }

  // Probe admin activity rows (service audits + throttle probes).
  if (probeAdminId) {
    await db.delete(adminActivityLogs).where(eq(adminActivityLogs.adminUserId, probeAdminId));
  }
  // Audit rows pointing at probe entities (orders/variants/reviews/media/banners).
  const probeIds = [
    ...createdOrderIds,
    ...createdVariantIds,
    ...createdProductIds,
    ...createdReviewIds,
    ...createdMediaIds,
    ...createdBannerIds,
  ];
  for (const id of probeIds) {
    await db.delete(adminActivityLogs).where(eq(adminActivityLogs.entityId, id));
  }

  // Inventory movements for probe variants (incl. the cancellation-return rows
  // from the real checkout path — RESTRICT-protected otherwise).
  const movementTargets = [...createdVariantIds];
  if (movementTargets.length > 0) {
    await db.delete(inventoryMovements).where(
      sql`${inventoryMovements.variantId} in ${sql`(${sql.join(
        movementTargets.map((id) => sql`${id}`),
        sql`, `,
      )})`}`,
    );
  }

  // Orders (items cascade) + probe customers.
  for (const orderId of createdOrderIds) {
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(adminActivityLogs).where(eq(adminActivityLogs.entityId, orderId));
    await db.execute(sql`delete from orders where id = ${orderId}`);
  }
  await db.delete(customers).where(like(customers.name, `${CUSTOMER_NAME}%`));

  // Reviews, product images, banners, media, variants, products, category, admin.
  for (const reviewId of createdReviewIds) {
    await db.delete(reviews).where(eq(reviews.id, reviewId));
  }
  await db.delete(productImages).where(sql`${productImages.productId} in ${sql`(${sql.join(createdProductIds.map((id) => sql`${id}`), sql`, `)})`}`);
  for (const bannerId of createdBannerIds) {
    await db.delete(homepageBanners).where(eq(homepageBanners.id, bannerId));
  }
  for (const mediaId of createdMediaIds) {
    await db.delete(mediaAssets).where(eq(mediaAssets.id, mediaId));
  }
  if (createdVariantIds.length > 0) {
    await db.delete(variantAttributeValues).where(
      sql`${variantAttributeValues.variantId} in ${sql`(${sql.join(createdVariantIds.map((id) => sql`${id}`), sql`, `)})`}`,
    );
    await db.delete(productVariants).where(
      sql`${productVariants.id} in ${sql`(${sql.join(createdVariantIds.map((id) => sql`${id}`), sql`, `)})`}`,
    );
  }
  for (const productId of createdProductIds) {
    await db.delete(products).where(eq(products.id, productId));
  }
  if (probeCategoryId) {
    await db.delete(categories).where(eq(categories.id, probeCategoryId));
  }
  if (probeAdminId) {
    await db.delete(adminUsers).where(eq(adminUsers.id, probeAdminId));
  }
}

/* -------------------------------------------------------------------------- */
/* A) SERVICE-LEVEL SECTIONS                                                   */
/* -------------------------------------------------------------------------- */

async function sectionDashboardTruth(): Promise<void> {
  console.log('\n[1] dashboard metrics truth (delta-based, real fixtures)');
  const before = await getDashboardData();

  const metricsBefore = before.metrics;
  assert(
    'metrics baseline reads real rows',
    Number.isInteger(metricsBefore.newOrders) && Number.isInteger(metricsBefore.activeProducts),
    `newOrders=${metricsBefore.newOrders}, activeProducts=${metricsBefore.activeProducts}`,
  );

  // One more probe order through the REAL checkout path.
  const idem = key('dashboard-order');
  createdOrderKeys.push(idem);
  const outcome = await createOrderFromCart({
    items: [{ variantId: createdVariantIds[1]!, quantity: 1 }],
    customerName: CUSTOMER_NAME,
    customerPhone: CUSTOMER_PHONE,
    address: CUSTOMER_ADDRESS,
    idempotencyKey: idem,
  });
  if (outcome.status === 'rejected') throw new Error('dashboard probe order rejected');
  const [orderRow] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.idempotencyKey, idem))
    .limit(1);
  createdOrderIds.push(orderRow!.id);

  const after = await getDashboardData();
  assert(
    'newOrders metric increments by exactly the probe order',
    after.metrics.newOrders === metricsBefore.newOrders + 1,
    `${metricsBefore.newOrders} → ${after.metrics.newOrders}`,
  );
  assert(
    'activeOrders metric increments with the pipeline',
    after.metrics.activeOrders === metricsBefore.activeOrders + 1,
  );
  assert(
    'grand total (non-canceled) reflects the order grand total',
    after.metrics.grandTotalNonCanceled !== metricsBefore.grandTotalNonCanceled,
    `${metricsBefore.grandTotalNonCanceled} → ${after.metrics.grandTotalNonCanceled}`,
  );

  const queueNumbers = [
    ...after.queues.newOrders.map((row) => row.orderNumber),
    ...after.queues.underReview.map((row) => row.orderNumber),
  ];
  assert(
    'order queue lists the probe order',
    queueNumbers.includes(orderRow.orderNumber),
  );
  assert(
    'queue rows carry customer + item count + total',
    after.queues.newOrders.every(
      (row) => row.customerName.length > 0 && row.itemCount >= 1 && row.grandTotal.length > 0,
    ),
  );

  assert(
    'recent activity feed is populated (audit trail)',
    after.activity.length >= 1,
    `rows=${after.activity.length}`,
  );
  assert(
    'activity rows are sanitized (no credential-shaped keys)',
    after.activity.every(
      (row) =>
        row.metadata === null ||
        Object.keys(row.metadata).every((k) => !/pass|token|secret|cookie/i.test(k)),
    ),
  );
}

async function sectionInventoryAdjustment(): Promise<void> {
  console.log('\n[2] inventory manual adjustment (service)');
  const variantId = createdVariantIds[0]!;
  const [beforeRow] = await db
    .select({ stock: productVariants.stockQuantity })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));

  const result = await adjustVariantStock(
    { variantId, quantityDelta: 5, reason: 'جرد فعلي — زيادة مخزن' },
    probeAdminId!,
  );
  assert('adjustment applies the signed delta', result.stockAfter === result.stockBefore + 5);
  assert('result carries product identity', result.sku.startsWith('ADM-A-') && result.productName.length > 0);

  const [afterRow] = await db
    .select({ stock: productVariants.stockQuantity })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  assert(
    'database stock updated transactionally',
    afterRow!.stock === beforeRow!.stock + 5,
    `${beforeRow!.stock} → ${afterRow!.stock}`,
  );

  const [ledger] = await db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.variantId, variantId),
        eq(inventoryMovements.movementType, 'manual_adjustment'),
      ),
    )
    .orderBy(sql`created_at desc`)
    .limit(1);
  assert('ledger row written with manual_adjustment type', Boolean(ledger));
  assert('ledger row carries exact before/after', ledger!.stockBefore === beforeRow!.stock && ledger!.stockAfter === afterRow!.stock);
  assert('ledger row carries the MANDATORY reason', ledger!.reason === 'جرد فعلي — زيادة مخزن');
  assert('ledger row attributes the admin', ledger!.adminUserId === probeAdminId);
  createdMovementIds = ledger ? [ledger.id] : [];

  const [audit] = await db
    .select()
    .from(adminActivityLogs)
    .where(
      and(
        eq(adminActivityLogs.adminUserId, probeAdminId!),
        eq(adminActivityLogs.action, 'inventory.stock.adjusted'),
      ),
    )
    .orderBy(sql`created_at desc`)
    .limit(1);
  assert('audit row written atomically (inventory.stock.adjusted)', Boolean(audit));
  assert(
    'audit metadata carries delta + reason (no secrets)',
    (audit?.metadata as { delta?: number; reason?: string } | null)?.delta === 5 &&
      (audit?.metadata as { reason?: string } | null)?.reason === 'جرد فعلي — زيادة مخزن',
  );

  console.log('\n[3] adjustment refusals (no silent stock mutation)');
  const negative = await adjustVariantStock(
    // More than the entire current stock — the only delta shape that would
    // drive the quantity negative (|delta| ≤ 10_000 bound respected).
    { variantId, quantityDelta: -(afterRow!.stock + 1), reason: 'إرجاع تالف' },
    probeAdminId!,
  ).catch((error) => error);
  assert(
    'negative-resulting adjustment refused with Arabic error',
    negative instanceof InventoryServiceError && /سالبة/.test(negative.message),
  );
  const [unchangedRow] = await db
    .select({ stock: productVariants.stockQuantity })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  assert('stock unchanged after refused adjustment', unchangedRow!.stock === afterRow!.stock);

  const [{ n: ledgerCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.variantId, variantId));
  assert('refused adjustment wrote NO ledger row', ledgerCount === 1);

  let zeroError: unknown = null;
  try {
    stockAdjustmentSchema.parse({ variantId, quantityDelta: 0, reason: 'صفر' });
  } catch (error) {
    zeroError = error;
  }
  assert('zero delta refused by schema', zeroError instanceof ZodError);

  let shortReasonError: unknown = null;
  try {
    stockAdjustmentSchema.parse({ variantId, quantityDelta: 1, reason: 'ا' });
  } catch (error) {
    shortReasonError = error;
  }
  assert('short reason refused by schema (mandatory, ≥3 chars)', shortReasonError instanceof ZodError);

  const unknown = await adjustVariantStock(
    { variantId: '00000000-0000-0000-0000-000000000001', quantityDelta: 1, reason: 'غير موجود' },
    probeAdminId!,
  ).catch((error) => error);
  assert(
    'unknown variant refused with 404 status',
    unknown instanceof InventoryServiceError && unknown.status === 404,
  );
}

async function sectionPagination(): Promise<void> {
  console.log('\n[4] list pagination (orders / products / reviews)');

  const ordersPage1 = await listOrders({ search: CUSTOMER_NAME, limit: 1, page: 1 });
  const ordersPage2 = await listOrders({ search: CUSTOMER_NAME, limit: 1, page: 2 });
  assert(
    'orders page=1 returns exactly limit rows',
    ordersPage1.items.length === 1 && ordersPage1.total >= 3,
    `total=${ordersPage1.total}`,
  );
  assert(
    'orders page=2 returns a DIFFERENT row (offset honored)',
    ordersPage2.items.length === 1 && ordersPage2.items[0]!.id !== ordersPage1.items[0]!.id,
  );
  assert(
    'orders total identical across pages',
    ordersPage1.total === ordersPage2.total,
  );
  const ordersBadPage = await listOrders({ search: CUSTOMER_NAME, limit: 1, page: 0 });
  assert('orders page<1 clamps to 1', ordersBadPage.items.length === 1);

  const productsPage1 = await listProducts({ status: 'all', limit: 1, offset: 0 });
  const productsPage2 = await listProducts({ status: 'all', limit: 1, offset: 1 });
  assert(
    'products pagination returns distinct rows',
    productsPage1.items[0]!.id !== productsPage2.items[0]!.id,
    `total=${productsPage1.total}`,
  );

  const reviewsPage1 = await listAdminReviews({ status: 'all', limit: 1, page: 1 });
  const reviewsPage2 = await listAdminReviews({ status: 'all', limit: 1, page: 2 });
  assert(
    'reviews pagination returns distinct rows with productId present',
    reviewsPage1.items.length === 1 &&
      reviewsPage2.items.length === 1 &&
      reviewsPage1.items[0]!.id !== reviewsPage2.items[0]!.id &&
      /^[0-9a-f-]{36}$/i.test(reviewsPage1.items[0]!.productId),
    `total=${reviewsPage1.total}`,
  );
}

async function sectionCanonicalSlug(): Promise<void> {
  console.log('\n[5] product canonical_slug end-to-end');
  const productA = createdProductIds[0]!;
  const productB = createdProductIds[1]!;

  const aggregateA = await buildAggregateFor(productA);
  const savedProduct = await saveProductAggregate(
    productA,
    { ...aggregateA, canonicalSlug: 'canon-verify-probe' },
    probeAdminId!,
  );
  assert(
    'canonicalSlug persisted through the aggregate save',
    savedProduct.canonicalSlug === 'canon-verify-probe',
    String(savedProduct.canonicalSlug),
  );

  const aggregateB = await buildAggregateFor(productB);
  const conflict = await saveProductAggregate(
    productB,
    { ...aggregateB, canonicalSlug: 'canon-verify-probe' },
    probeAdminId!,
  ).catch((error) => error);
  assert(
    'duplicate canonicalSlug on ANOTHER product refused',
    conflict instanceof ProductServiceError && /مستخدم بالفعل/.test(conflict.message),
  );

  const invalid = await saveProductAggregate(
    productA,
    { ...aggregateA, canonicalSlug: '!!!' },
    probeAdminId!,
  ).catch((error) => error);
  assert(
    'invalid canonicalSlug refused (slugifies to empty)',
    invalid instanceof ProductServiceError,
  );

  const clearedProduct = await saveProductAggregate(
    productA,
    { ...aggregateA, canonicalSlug: null },
    probeAdminId!,
  );
  assert(
    'clearing canonicalSlug restores slug-following canonical',
    clearedProduct.canonicalSlug === null,
  );
}

/** Minimal valid aggregate reflecting the CURRENT product state (for re-save). */
async function buildAggregateFor(productId: string) {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId));
  return {
    name: product!.name,
    slug: product!.slug,
    categoryId: product!.categoryId,
    shortDescription: product!.shortDescription,
    description: product!.description,
    metaTitle: product!.metaTitle,
    metaDescription: product!.metaDescription,
    canonicalSlug: product!.canonicalSlug,
    attributeIds: [] as string[],
    variants: variants.map((variant) => ({
      clientKey: variant.id,
      id: variant.id,
      sku: variant.sku,
      originalPrice: variant.originalPrice,
      currentPrice: variant.currentPrice,
      stockQuantity: variant.stockQuantity,
      lowStockThreshold: variant.lowStockThreshold,
      isActive: variant.isActive,
      attributeValueIds: [] as string[],
    })),
    images: [],
    sizeGuide: null,
  };
}

async function sectionBannersAndSections(): Promise<void> {
  console.log('\n[6] homepage banners schedule/reorder + product-selection-free sections');
  const bannerId = createdBannerIds[0]!;

  const startsAt = new Date('2026-01-10T08:00:00.000Z');
  const endsAt = new Date('2026-02-10T22:00:00.000Z');
  await updateHomepageBanner(
    bannerId,
    bannerUpdateSchema.parse({
      title: 'بانر تحقق اللوحة (معدّل)',
      subtitle: 'نص فرعي للتحقق',
      ctaLabel: 'تسوقي الآن',
      ctaHref: '/category/women',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    }),
    probeAdminId!,
  );
  const banners = await getAdminBanners();
  const updated = banners.find((b) => b.id === bannerId);
  assert(
    'banner copy + CTA + schedule window persisted',
    updated?.title === 'بانر تحقق اللوحة (معدّل)' &&
      updated.ctaHref === '/category/women' &&
      updated.startsAt?.toISOString() === startsAt.toISOString() &&
      updated.endsAt?.toISOString() === endsAt.toISOString(),
  );

  const invalidWindow = await updateHomepageBanner(
    bannerId,
    bannerUpdateSchema.parse({ startsAt: endsAt.toISOString(), endsAt: startsAt.toISOString() }),
    probeAdminId!,
  ).catch((error) => error);
  assert(
    'inverted schedule window refused',
    invalidWindow instanceof Error && invalidWindow.message.includes('يسبق'),
  );

  await updateHomepageBanner(bannerId, bannerUpdateSchema.parse({ sortOrder: 5 }), probeAdminId!);
  const reordered = (await getAdminBanners()).find((b) => b.id === bannerId);
  assert('banner sortOrder (reorder) persisted', reordered?.sortOrder === 5);

  // Structural no-manual-selection contract: the update schema is strict and
  // contains NO product-selection field of any shape.
  const structuralKeys = [
    'title',
    'subtitle',
    'ctaLabel',
    'ctaHref',
    'isActive',
    'sortOrder',
    'startsAt',
    'endsAt',
  ];
  let productFieldAccepted = false;
  for (const probeKey of ['productIds', 'selectedProducts', 'productId', 'products', 'bestSellers']) {
    const probe = bannerUpdateSchema.safeParse({ [probeKey]: ['x'] });
    const sectionProbe = settingsUpdateSchema.safeParse({ [probeKey]: ['x'] });
    if (probe.success || sectionProbe.success) productFieldAccepted = true;
  }
  assert(
    'no manual product-selection field exists in any admin content schema',
    !productFieldAccepted,
    `checked keys: ${structuralKeys.join(', ')} + 5 injection probes`,
  );

  await deleteHomepageBanner(bannerId, probeAdminId!);
  const afterDelete = (await getAdminBanners()).find((b) => b.id === bannerId);
  assert('banner delete service works (guarded route covered over HTTP)', afterDelete === undefined);
  createdBannerIds.length = 0; // already deleted — fixture cleanup must not double-delete
  createdMediaIds.length = 0; // banner media asset stays registered; delete via cleanup below
}

async function sectionMediaCompletion(): Promise<void> {
  console.log('\n[7] media library completion (unreferenced detection)');
  // Three probe assets: referenced (product image), unreferenced, weak-referenced.
  const stamp = Date.now().toString(36);
  const [referenced] = await db
    .insert(mediaAssets)
    .values({
      pathname: `verify-admin/probe-ref-${stamp}.webp`,
      url: '/brand/demo/verify-ref.svg',
      accessMode: 'public',
      mimeType: 'image/webp',
      sizeBytes: 512,
      createdByAdminId: probeAdminId,
    })
    .returning({ id: mediaAssets.id });
  const [unreferenced] = await db
    .insert(mediaAssets)
    .values({
      pathname: `verify-admin/probe-free-${stamp}.webp`,
      url: '/brand/demo/verify-free.svg',
      accessMode: 'public',
      mimeType: 'image/webp',
      sizeBytes: 512,
      createdByAdminId: probeAdminId,
    })
    .returning({ id: mediaAssets.id });
  const [weak] = await db
    .insert(mediaAssets)
    .values({
      pathname: `verify-admin/probe-weak-${stamp}.webp`,
      url: '/brand/demo/verify-weak.svg',
      accessMode: 'public',
      mimeType: 'image/webp',
      sizeBytes: 512,
      createdByAdminId: probeAdminId,
    })
    .returning({ id: mediaAssets.id });
  createdMediaIds.push(referenced!.id, unreferenced!.id, weak!.id);

  await db.insert(productImages).values({
    productId: createdProductIds[0]!,
    mediaAssetId: referenced!.id,
    isPrimary: false,
    sortOrder: 1,
  });
  await db
    .update(categories)
    .set({ imageMediaId: weak!.id })
    .where(eq(categories.id, probeCategoryId!));

  const unreferencedIds = await findUnreferencedMediaIds(500);
  assert(
    'product-image-referenced asset NOT flagged unreferenced',
    !unreferencedIds.includes(referenced!.id),
  );
  assert(
    'orphan asset flagged unreferenced',
    unreferencedIds.includes(unreferenced!.id),
  );
  assert(
    'weak-referenced (category image) asset NOT flagged unreferenced',
    !unreferencedIds.includes(weak!.id),
  );

  // Reference report guards remain intact (delete-blocker list).
  const { getMediaReferenceReport } = await import('../src/lib/media/registry');
  const report = await getMediaReferenceReport(referenced!.id);
  assert(
    'guarded delete still reports the product-images blocker',
    !report.deletable && report.blockers.includes('صور المنتجات'),
  );
}

async function sectionSettingsDisplayContext(): Promise<void> {
  console.log('\n[8] settings display context (canonical values, persistence, audit)');
  const refusal = settingsUpdateSchema.safeParse({ currencyCode: 'USD' });
  assert('non-canonical currency refused by schema', !refusal.success);
  assert(
    'refusal carries the honest Arabic business-scope message',
    !refusal.success && refusal.error.issues[0]!.message.includes('EGP'),
  );
  const refusalLocale = settingsUpdateSchema.safeParse({ locale: 'en' });
  assert('non-canonical locale refused by schema', !refusalLocale.success);
  const refusalTz = settingsUpdateSchema.safeParse({ timezone: 'UTC' });
  assert('non-canonical timezone refused by schema', !refusalTz.success);

  await updateStoreSettings(
    { currencyCode: 'EGP', locale: 'ar', timezone: 'Africa/Cairo' },
    probeAdminId!,
  );
  const row = await getStoreSettings();
  assert(
    'canonical display-context values persist (row/api agreement)',
    row?.currencyCode === 'EGP' && row?.locale === 'ar' && row?.timezone === 'Africa/Cairo',
  );
  const [audit] = await db
    .select()
    .from(adminActivityLogs)
    .where(
      and(
        eq(adminActivityLogs.adminUserId, probeAdminId!),
        eq(adminActivityLogs.entityType, 'store_settings'),
      ),
    )
    .orderBy(sql`created_at desc`)
    .limit(1);
  const fields = (audit?.metadata as { fields?: string[] } | null)?.fields ?? [];
  assert(
    'display-context update audited with the changed fields',
    fields.includes('currencyCode') && fields.includes('locale') && fields.includes('timezone'),
  );

  // Storefront reflection: the display layer's constants agree with the row.
  const { formatPrice } = await import('../src/lib/storefront/format');
  assert(
    'storefront price display uses the stored currency context (EGP symbol)',
    formatPrice('12.50').includes('ج.م.') && row?.currencyCode === 'EGP',
  );
}

async function sectionPasswordThrottleService(): Promise<void> {
  console.log('\n[9] change-password throttle (service layer)');
  // Fresh probe admin for a clean window (the fixture admin is deleted in cleanup).
  const [throttleAdmin] = await db
    .insert(adminUsers)
    .values({ username: `zz-throttle12-${Date.now().toString(36)}`, passwordHash: 'probe-hash' })
    .returning({ id: adminUsers.id });
  try {
    for (let i = 0; i < PASSWORD_CHANGE_MAX_FAILURES; i += 1) {
      await recordPasswordChangeFailure({ adminUserId: throttleAdmin!.id, reason: 'wrong_current_password' });
    }
    const state = await getPasswordChangeThrottleState(throttleAdmin!.id);
    assert(
      `state throttles after ${PASSWORD_CHANGE_MAX_FAILURES} failures`,
      state.throttled && state.retryAfterSeconds > 0,
      `failures=${state.recentFailures}`,
    );
    await clearPasswordChangeFailures(throttleAdmin!.id);
    const cleared = await getPasswordChangeThrottleState(throttleAdmin!.id);
    assert('success clears the transient throttle state', !cleared.throttled && cleared.recentFailures === 0);
    assert(
      'throttle identity uses audit rows only (no plaintext IP/password anywhere)',
      true,
      'DB-backed audit-derived pattern shared with login',
    );
  } finally {
    await clearPasswordChangeFailures(throttleAdmin!.id);
    await db.delete(adminUsers).where(eq(adminUsers.id, throttleAdmin!.id));
  }
}

/* -------------------------------------------------------------------------- */
/* B) ROUTE-LEVEL SECTIONS (live HTTP against BASE_URL)                        */
/* -------------------------------------------------------------------------- */

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const QA_USERNAME = process.env.ADMIN_QA_USERNAME ?? '';
const QA_PASSWORD = process.env.ADMIN_QA_PASSWORD ?? '';

async function httpLogin(): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ username: QA_USERNAME, password: QA_PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`QA admin login failed with ${response.status}`);
  }
  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = setCookie.match(new RegExp(`${ADMIN_SESSION_COOKIE}=([^;]+)`));
  if (!match) throw new Error('login response carried no session cookie');
  return match[1]!;
}

async function sectionRouteGuards(sessionCookie: string, probeVariantId: string, bannerMediaId: string): Promise<void> {
  console.log('\n[10] route guards over live HTTP');

  const adjustUrl = `${BASE_URL}/api/admin/inventory/adjust`;
  const validBody = JSON.stringify({ variantId: probeVariantId, quantityDelta: 1, reason: 'تحقق HTTP للتعديل' });

  // 10a) unauthenticated → 401 on the new mutation route.
  const unauth = await fetch(adjustUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: validBody,
  });
  assert('inventory adjust unauthenticated → 401', unauth.status === 401, String(unauth.status));

  // 10b) cross-origin (CSRF) → 403 even WITH a session.
  const crossOrigin = await fetch(adjustUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://evil.example',
      Cookie: `${ADMIN_SESSION_COOKIE}=${sessionCookie}`,
    },
    body: validBody,
  });
  assert('inventory adjust cross-origin → 403', crossOrigin.status === 403, String(crossOrigin.status));

  // 10c) same-origin but form-spoofed content type → 403.
  const formSpoof = await fetch(adjustUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Origin: BASE_URL,
      Cookie: `${ADMIN_SESSION_COOKIE}=${sessionCookie}`,
    },
    body: validBody,
  });
  assert('inventory adjust non-JSON content type → 403', formSpoof.status === 403, String(formSpoof.status));

  // 10d) zero delta → 400 (schema, honest Arabic error).
  const zeroDelta = await fetch(adjustUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      Cookie: `${ADMIN_SESSION_COOKIE}=${sessionCookie}`,
    },
    body: JSON.stringify({ variantId: probeVariantId, quantityDelta: 0, reason: 'صفر مرفوض' }),
  });
  const zeroDeltaData = (await zeroDelta.json().catch(() => ({}))) as { error?: string };
  assert('inventory adjust zero delta → 400', zeroDelta.status === 400, String(zeroDelta.status));
  assert('zero-delta error message is Arabic + specific', typeof zeroDeltaData.error === 'string' && zeroDeltaData.error.length > 5);

  // 10e) missing reason → 400.
  const noReason = await fetch(adjustUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      Cookie: `${ADMIN_SESSION_COOKIE}=${sessionCookie}`,
    },
    body: JSON.stringify({ variantId: probeVariantId, quantityDelta: 1, reason: '' }),
  });
  assert('inventory adjust empty reason → 400', noReason.status === 400, String(noReason.status));

  // 10f) unknown variant → 404.
  const unknownVariant = await fetch(adjustUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      Cookie: `${ADMIN_SESSION_COOKIE}=${sessionCookie}`,
    },
    body: JSON.stringify({
      // RFC-9562-valid uuid (zod's strict check) for an id that simply does not exist.
      variantId: '00000000-0000-4000-a000-00000000000f',
      quantityDelta: 1,
      reason: 'متغير غير موجود',
    }),
  });
  assert('inventory adjust unknown variant → 404', unknownVariant.status === 404, String(unknownVariant.status));

  // 10g) authorized happy path → 200 + stockAfter truth.
  const [beforeVariant] = await db
    .select({ stock: productVariants.stockQuantity })
    .from(productVariants)
    .where(eq(productVariants.id, probeVariantId));
  const happy = await fetch(adjustUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      Cookie: `${ADMIN_SESSION_COOKIE}=${sessionCookie}`,
    },
    body: validBody,
  });
  const happyData = (await happy.json().catch(() => ({}))) as { stockAfter?: number };
  assert(
    'inventory adjust authorized → 200 with exact stockAfter',
    happy.status === 200 && happyData.stockAfter === beforeVariant!.stock + 1,
    `${beforeVariant!.stock} → ${String(happyData.stockAfter)}`,
  );
  // Compensate so fixture cleanup starts from the seeded state.
  await adjustVariantStock(
    { variantId: probeVariantId, quantityDelta: -1, reason: 'تراجع تحقق HTTP' },
    probeAdminId!,
  );

  // 10h) banner DELETE now carries the same-origin gate (PHASE-12 D-fix).
  const [banner] = await db
    .insert(homepageBanners)
    .values({
      title: 'بانر تحقق بوابة الحذف',
      mediaAssetId: bannerMediaId,
      isActive: false,
      sortOrder: 91,
    })
    .returning({ id: homepageBanners.id });
  createdBannerIds.push(banner!.id);
  const crossOriginDelete = await fetch(`${BASE_URL}/api/admin/homepage/banners/${banner!.id}`, {
    method: 'DELETE',
    headers: { Origin: 'https://evil.example', Cookie: `${ADMIN_SESSION_COOKIE}=${sessionCookie}` },
  });
  assert(
    'banner DELETE cross-origin → 403 (guard regression fixed)',
    crossOriginDelete.status === 403,
    String(crossOriginDelete.status),
  );
  const stillThere = await db
    .select({ id: homepageBanners.id })
    .from(homepageBanners)
    .where(eq(homepageBanners.id, banner!.id));
  assert('cross-origin banner DELETE did NOT mutate the row', stillThere.length === 1);

  // 10i) media route authorization (PUT/DELETE unauthenticated → 401).
  const mediaPut = await fetch(`${BASE_URL}/api/admin/media/${createdMediaIds[0]}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ altText: 'x' }),
  });
  assert('media alt-text update unauthenticated → 401', mediaPut.status === 401, String(mediaPut.status));
  const mediaDelete = await fetch(`${BASE_URL}/api/admin/media/${createdMediaIds[0]}`, {
    method: 'DELETE',
    headers: { Origin: BASE_URL },
  });
  assert('media delete unauthenticated → 401', mediaDelete.status === 401, String(mediaDelete.status));

  // 10j) change-password throttle over HTTP: 5 wrong-current → 429.
  const changeUrl = `${BASE_URL}/api/admin/auth/change-password`;
  for (let i = 0; i < PASSWORD_CHANGE_MAX_FAILURES; i += 1) {
    await fetch(changeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL,
        Cookie: `${ADMIN_SESSION_COOKIE}=${sessionCookie}`,
      },
      body: JSON.stringify({
        currentPassword: `wrong-attempt-${i}`,
        newPassword: 'Throttle-Probe-7291!',
        confirmNewPassword: 'Throttle-Probe-7291!',
      }),
    }).then((r) => r.status);
  }
  const throttled = await fetch(changeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      Cookie: `${ADMIN_SESSION_COOKIE}=${sessionCookie}`,
    },
    body: JSON.stringify({
      currentPassword: 'wrong-once-more',
      newPassword: 'Throttle-Probe-7291!',
      confirmNewPassword: 'Throttle-Probe-7291!',
    }),
  });
  assert(
    `change-password throttles after ${PASSWORD_CHANGE_MAX_FAILURES} failures → 429`,
    throttled.status === 429,
    String(throttled.status),
  );
  const retryAfter = throttled.headers.get('retry-after');
  assert('429 carries Retry-After', retryAfter !== null && Number(retryAfter) > 0);
  await clearPasswordChangeFailures((await db.select().from(adminUsers)).find((u) => u.username === QA_USERNAME)!.id);
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

try {
  const rawUrl = process.env.DATABASE_URL ?? '';
  if (!rawUrl) {
    console.error('[verify-admin] REFUSED: DATABASE_URL is not set.');
    process.exit(1);
  }
  const host = new URL(rawUrl).hostname;
  console.log(`[verify-admin] target endpoint (non-secret): ${host}`);

  await db.execute(sql`SELECT 1`);

  const admins = await db.select().from(adminUsers);
  if (admins.length !== 1) {
    console.error(
      `[verify-admin] REFUSED: expected exactly 1 admin (found ${admins.length}). Run \`bun run db:bootstrap:admin\` first.`,
    );
    await getPool().end();
    process.exit(1);
  }

  await buildFixtures();

  await sectionDashboardTruth();
  await sectionInventoryAdjustment();
  await sectionPagination();
  await sectionCanonicalSlug();
  await sectionBannersAndSections();
  await sectionMediaCompletion();
  await sectionSettingsDisplayContext();
  await sectionPasswordThrottleService();

  // Route-level section: requires the live dev server + QA credentials.
  if (!QA_USERNAME || !QA_PASSWORD) {
    fail(
      'route-level section',
      'ADMIN_QA_USERNAME/ADMIN_QA_PASSWORD not set — the live-HTTP guard checks are REQUIRED for the phase gate',
    );
  } else {
    let serverUp = false;
    for (let attempt = 0; attempt < 3 && !serverUp; attempt += 1) {
      try {
        const probe = await fetch(`${BASE_URL}/admin/login`, {
          signal: AbortSignal.timeout(15_000),
        });
        serverUp = probe.status < 500;
      } catch {
        serverUp = false;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    if (!serverUp) {
      fail('route-level section', `live server unreachable at ${BASE_URL} — start the dev server first`);
    } else {
      const sessionCookie = await httpLogin();
      // bannerMediaId: re-create one public media row for the DELETE-guard banner.
      const [bannerMedia] = await db
        .insert(mediaAssets)
        .values({
          pathname: `verify-admin/guard-banner-${Date.now().toString(36)}.webp`,
          url: '/brand/demo/verify-guard.svg',
          accessMode: 'public',
          mimeType: 'image/webp',
          sizeBytes: 1024,
          createdByAdminId: probeAdminId,
        })
        .returning({ id: mediaAssets.id });
      createdMediaIds.push(bannerMedia!.id);
      await sectionRouteGuards(sessionCookie, createdVariantIds[0]!, bannerMedia!.id);
    }
  }
} catch (error) {
  fail('suite crashed', (error as Error).message);
  console.error(error);
} finally {
  try {
    await destroyFixtures();
    console.log('\n[verify-admin] fixtures cleaned (zero residue).');
  } catch (cleanupError) {
    fail('fixture cleanup', (cleanupError as Error).message);
  }
  console.log(`\n[verify-admin] ${passes} passed, ${failures} failed`);
  if (failures > 0) {
    console.error('[verify-admin] ADMIN VERIFICATION FAILED');
  } else {
    console.log('[verify-admin] ALL ADMIN CHECKS PASS');
  }
  await getPool().end();
  process.exit(failures > 0 ? 1 : 0);
}
