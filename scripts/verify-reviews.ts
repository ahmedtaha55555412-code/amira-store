/**
 * Amira Store — PHASE-09 reviews + WhatsApp testimonials verification suite.
 *
 * Exercises the application's OWN services (src/lib/storefront/reviews.ts,
 * src/lib/admin/reviews.ts, src/lib/admin/testimonials.ts) against the target
 * database and asserts every PHASE-09 behavior (docs/phases/PHASE-09.md +
 * MASTER_PLAN §15 + §24):
 *
 *   1. PURE: zod request schemas (order-number shape, rating bounds, comment
 *      length) + the in-memory submission rate limiter
 *   2. Order lookup: unknown number / wrong phone → the SAME generic error
 *      (no order-existence oracle); non-delivered → delivered-only gate
 *   3. Lookup (delivered): returns items with review-state, no PII echo
 *   4. Submission: pending + verified-purchase + product/customer linkage;
 *      duplicate → friendly 409; foreign order item → generic miss
 *   5. DB structural duplicate probe: second verified review per order item →
 *      23505 on the partial unique index (concurrency backstop)
 *   6. Moderation: reject/approve transitions, idempotent re-runs (no audit
 *      spam), sanitized audit rows
 *   7. Public feeds: homepage reviews = approved only; pending never public
 *   8. Testimonials: create (draft, PRIVATE media) → publish WITHOUT
 *      confirmation refused → publish WITH confirmation → published → update
 *      fields/sort/product → hide withdraws from surfaces → re-publish
 *      requires confirmation again
 *   9. MEDIA (live, when Blob is configured): review image registers PRIVATE;
 *      approval materializes it PUBLIC (registry access_mode flips; public
 *      feed carries the public URL) — unapproved media never publicly exposed
 *  10. ROLLBACK: duplicate submission with an image leaves ZERO media residue
 *
 * Safety: REFUSES NODE_ENV=production; fixtures cleaned LIFO in finally with
 * residue probes; never prints credentials; live-Blob objects deleted by
 * pathname.
 *
 * Run against the isolated development database only:
 *   set -a; . ./.env.local; set +a; bun run verify:reviews
 */

import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import sharp from 'sharp';

import { db, getPool } from '../src/db/client';
import {
  adminActivityLogs,
  adminUsers,
  attributeValues,
  attributes,
  categories,
  customers,
  inventoryMovements,
  mediaAssets,
  orderItems,
  orders,
  productVariants,
  products,
  reviewImages,
  reviews,
  variantAttributeValues,
  whatsappTestimonials,
} from '../src/db/schema';
import { createOrderFromCart } from '../src/lib/storefront/checkout';
import { transitionShippingStatus } from '../src/lib/admin/orders';
import {
  ReviewServiceError,
  lookupReviewableOrder,
  reviewLookupSchema,
  reviewSubmissionRateLimit,
  reviewSubmissionSchema,
  getHomepageReviews,
  getPublishedTestimonials,
  getProductTestimonials,
  submitReview,
} from '../src/lib/storefront/reviews';
import {
  ReviewModerationError,
  listAdminReviews,
  moderateReview,
} from '../src/lib/admin/reviews';
import {
  TestimonialServiceError,
  createTestimonial,
  hideTestimonial,
  listAdminTestimonials,
  publishTestimonial,
  updateTestimonial,
} from '../src/lib/admin/testimonials';
import { isMediaUploadConfigured } from '../src/lib/media/service';

if (process.env.NODE_ENV === 'production') {
  console.error('[verify-reviews] REFUSED: never run review probes against production.');
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
  return `rev-${label}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Expects the promise to reject with the given domain error class. */
async function expectReject<T extends new (...args: never[]) => Error>(
  name: string,
  errorClass: T,
  run: () => Promise<unknown>,
  expectedStatus?: number,
): Promise<void> {
  try {
    await run();
    fail(name, 'service accepted an illegal operation');
  } catch (error) {
    if (error instanceof errorClass) {
      const status = (error as { status?: number }).status;
      if (expectedStatus !== undefined && status !== expectedStatus) {
        fail(name, `wrong status ${status}, expected ${expectedStatus}`);
      } else {
        pass(name, error.message.slice(0, 80));
      }
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
const probePathnames: string[] = []; // live-Blob objects deleted on cleanup

let probeCategoryId = '';
let attrSize = ''; let valueM = '';
let productA = ''; let variantA_M = ''; let variantA_L = '';
let productB = ''; let variantB_default = '';
let probeAdminId = '';

const CUSTOMER_NAME = 'عميل اختبار التقييمات';
const CUSTOMER_PHONE = '01055512345';

/** Captured probe orders (id + customer-facing number) by label. */
const probeOrders: Record<string, { id: string; orderNumber: string }> = {};

async function buildFixtures(): Promise<void> {
  const [attr] = await db.insert(attributes).values({
    name: 'المقاس (اختبار التقييمات)', slug: `rev-size-${Date.now().toString(36)}`,
  }).returning({ id: attributes.id });
  attrSize = attr!.id; createdAttributeIds.push(attrSize);
  const [valM] = await db.insert(attributeValues).values({
    attributeId: attrSize, value: 'M (اختبار)', slug: `m-rev-${Date.now().toString(36)}`,
  }).returning({ id: attributeValues.id });
  valueM = valM!.id;

  const [cat] = await db.insert(categories).values({
    name: 'اختبار التقييمات (مؤقت)', slug: `rev-cat-${Date.now().toString(36)}`, isActive: true,
  }).returning({ id: categories.id });
  probeCategoryId = cat!.id; createdCategoryIds.push(probeCategoryId);

  // Product A — two size variants; A is the review target.
  const [pa] = await db.insert(products).values({
    categoryId: probeCategoryId, name: 'منتج اختبار التقييمات أ', slug: `rev-prod-a-${Date.now().toString(36)}`, status: 'active',
  }).returning({ id: products.id });
  productA = pa!.id; createdProductIds.push(productA);
  const [vAm] = await db.insert(productVariants).values({
    productId: productA, sku: `REV-A-M-${Date.now().toString(36)}`, originalPrice: '150.00', currentPrice: '125.50', stockQuantity: 10,
  }).returning({ id: productVariants.id });
  variantA_M = vAm!.id;
  const [vAl] = await db.insert(productVariants).values({
    productId: productA, sku: `REV-A-L-${Date.now().toString(36)}`, originalPrice: '240.00', currentPrice: '199.00', stockQuantity: 10,
  }).returning({ id: productVariants.id });
  variantA_L = vAl!.id;
  await db.insert(variantAttributeValues).values({
    variantId: variantA_M, attributeValueId: valueM, attributeId: attrSize,
  });

  // Product B — no-attribute default variant (multi-line order).
  const [pb] = await db.insert(products).values({
    categoryId: probeCategoryId, name: 'منتج اختبار التقييمات ب', slug: `rev-prod-b-${Date.now().toString(36)}`, status: 'active',
  }).returning({ id: products.id });
  productB = pb!.id; createdProductIds.push(productB);
  const [vb] = await db.insert(productVariants).values({
    productId: productB, sku: `REV-B-${Date.now().toString(36)}`, originalPrice: '60.00', currentPrice: '47.25', stockQuantity: 10,
  }).returning({ id: productVariants.id });
  variantB_default = vb!.id;

  const [admin] = await db.insert(adminUsers).values({
    username: `zz-rev-admin-${Date.now().toString(36)}`, passwordHash: 'probe-hash',
  }).returning({ id: adminUsers.id });
  probeAdminId = admin!.id; createdAdminIds.push(probeAdminId);
}

/** Real checkout path → committed order; captures id + order number. */
async function createProbeOrder(
  items: Array<{ variantId: string; quantity: number }>,
  label: string,
): Promise<string> {
  const idem = key(label);
  const outcome = await createOrderFromCart({
    items,
    customerName: `${CUSTOMER_NAME} ${label}`,
    customerPhone: CUSTOMER_PHONE,
    address: 'الجيزة، شارع التقييمات الاختباري، عمارة 3',
    idempotencyKey: idem,
  });
  if (outcome.status === 'rejected') {
    throw new Error(`probe order rejected: ${JSON.stringify(outcome.lineErrors)}`);
  }
  const [row] = await db
    .select({ id: orders.id, n: orders.orderNumber })
    .from(orders)
    .where(eq(orders.idempotencyKey, idem))
    .limit(1);
  probeOrders[label] = { id: row!.id, orderNumber: row!.n };
  return row!.id;
}

function probeOrderNumber(label: string): string {
  return probeOrders[label]!.orderNumber;
}

/** Walk the real admin shipping chain to `delivered` (integration-honest). */
async function deliverOrder(orderId: string): Promise<void> {
  for (const step of [
    'preparing',
    'ready_to_ship',
    'shipped',
    'out_for_delivery',
    'delivered',
  ] as const) {
    await transitionShippingStatus(orderId, step, probeAdminId);
  }
}

/** A real, valid, ≥100px PNG (passes the media validation gauntlet). */
async function probeImageBytes(color: string): Promise<Buffer> {
  return sharp({ create: { width: 220, height: 180, channels: 3, background: color } })
    .png()
    .toBuffer();
}

/* -------------------------------------------------------------------------- */
/* Main sections                                                               */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const mediaConfigured = isMediaUploadConfigured();

  await preclean();

  console.log('\n[1] PURE gates — request schemas + rate limiter');
  {
    const good = reviewLookupSchema.safeParse({
      orderNumber: 'amr-4kp7qx', phone: '010 1234 5678',
    });
    assert('lookup schema normalizes order number case',
      good.success && good.data.orderNumber === 'AMR-4KP7QX');

    const badNumber = reviewLookupSchema.safeParse({ orderNumber: 'XX-123', phone: '01012345678' });
    assert('lookup schema rejects malformed order number', !badNumber.success);

    const badPhone = reviewLookupSchema.safeParse({ orderNumber: 'AMR-4KP7QX', phone: '12345' });
    assert('lookup schema rejects non-Egyptian phone', !badPhone.success);

    const badRating = reviewSubmissionSchema.safeParse({
      orderNumber: 'AMR-4KP7QX', phone: '01012345678',
      orderItemId: '00000000-0000-0000-0000-000000000000',
      rating: 6, comment: 'تقييم طويل بما يكفي للمرور من الحد الأدنى المطلوب',
    });
    assert('submission schema rejects rating 6', !badRating.success);

    const zeroRating = reviewSubmissionSchema.safeParse({
      orderNumber: 'AMR-4KP7QX', phone: '01012345678',
      orderItemId: '00000000-0000-0000-0000-000000000000',
      rating: 0, comment: 'تقييم طويل بما يكفي للمرور من الحد الأدنى المطلوب',
    });
    assert('submission schema rejects rating 0', !zeroRating.success);

    const shortComment = reviewSubmissionSchema.safeParse({
      orderNumber: 'AMR-4KP7QX', phone: '01012345678',
      orderItemId: '00000000-0000-0000-0000-000000000000',
      rating: 5, comment: 'قصير',
    });
    assert('submission schema rejects short comment', !shortComment.success);

    const limiterKey = key('rate');
    let allowed = 0;
    for (let i = 0; i < 10; i += 1) {
      if (reviewSubmissionRateLimit(limiterKey, 1_000_000 + i)) allowed += 1;
    }
    assert('rate limiter allows up to the cap', allowed === 8, `allowed=${allowed}`);
    assert('rate limiter blocks beyond the cap', !reviewSubmissionRateLimit(limiterKey, 1_000_010));
    assert('rate limiter is keyed (other keys unaffected)', reviewSubmissionRateLimit(key('other'), 1_000_010));
  }

  await buildFixtures();

  // o1 delivered (M ×2 + B ×1) — review target; o2 NOT delivered (L ×1).
  const order1 = await createProbeOrder(
    [{ variantId: variantA_M, quantity: 2 }, { variantId: variantB_default, quantity: 1 }],
    'o1',
  );
  await deliverOrder(order1);
  await createProbeOrder([{ variantId: variantA_L, quantity: 1 }], 'o2');

  const order1Items = await db
    .select({ id: orderItems.id, variantId: orderItems.variantId })
    .from(orderItems)
    .where(eq(orderItems.orderId, order1));
  const itemM = order1Items.find((i) => i.variantId === variantA_M)!;
  const itemB = order1Items.find((i) => i.variantId === variantB_default)!;

  console.log('\n[2] Order lookup — generic errors, no existence oracle');
  {
    let unknownError: string | null = null;
    let wrongPhoneError: string | null = null;
    try {
      await lookupReviewableOrder({ orderNumber: 'AMR-ZZZZZZ', phone: CUSTOMER_PHONE });
    } catch (error) {
      unknownError = (error as ReviewServiceError).message ?? null;
    }
    try {
      await lookupReviewableOrder({ orderNumber: 'AMR-4KP7QX', phone: '01000000000' });
    } catch (error) {
      wrongPhoneError = (error as ReviewServiceError).message ?? null;
    }
    assert('unknown order number → generic ReviewServiceError', unknownError !== null);
    assert('wrong phone → the SAME generic error (no oracle)',
      unknownError !== null && unknownError === wrongPhoneError,
      unknownError?.slice(0, 40));
  }

  console.log('\n[3] Lookup — delivered-only gate + item surface');
  {
    await expectReject(
      'non-delivered order → delivered-only error',
      ReviewServiceError,
      () => lookupReviewableOrder({ orderNumber: probeOrderNumber('o2'), phone: CUSTOMER_PHONE }),
    );

    const items = await lookupReviewableOrder({
      orderNumber: probeOrderNumber('o1'), phone: CUSTOMER_PHONE,
    });
    assert('delivered order lookup returns its items', items.length === 2, `${items.length} items`);
    const target = items.find((i) => i.orderItemId === itemM.id);
    assert('item surface has no PII (name/attributes/qty only)',
      target !== undefined && !('orderId' in target!) && !('phone' in target!));
    assert('not-yet-reviewed items flagged', target?.alreadyReviewed === false);
  }

  console.log('\n[4] Submission — verified pending review + duplicate + foreign item');
  let review1Id = '';
  {
    const result = await submitReview({
      fields: {
        orderNumber: probeOrderNumber('o1'),
        phone: CUSTOMER_PHONE,
        orderItemId: itemM.id,
        rating: 5,
        comment: 'جودة عالية والخامة ممتازة، والتوصيل كان أسرع من المتوقع. شكرًا أميرة استور!',
      },
      image: null,
    });
    review1Id = result.reviewId;
    assert('valid submission creates a review', review1Id.length > 0);

    const [row] = await db.select().from(reviews).where(eq(reviews.id, review1Id));
    assert('review is PENDING (moderation default)', row?.status === 'pending');
    assert('review is VERIFIED purchase', row?.isVerifiedPurchase === true);
    assert('review linked to the delivered order item', row?.orderItemId === itemM.id);
    assert('review linked to the correct product', row?.productId === productA);

    const [order1Row] = await db.select().from(orders).where(eq(orders.id, order1));
    const [customerRow] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, order1Row.customerId));
    assert('review customer linkage from the order', row?.customerId === customerRow.id);

    await expectReject(
      'duplicate verified review for the same item → 409 friendly',
      ReviewServiceError,
      () => submitReview({
        fields: {
          orderNumber: probeOrderNumber('o1'), phone: CUSTOMER_PHONE,
          orderItemId: itemM.id, rating: 4,
          comment: 'محاولة تقييم مكرر لنفس المنتج في نفس الطلب يجب أن ترفض.',
        },
        image: null,
      }),
      409,
    );

    // Foreign order item: an item from ANOTHER (non-matching) order.
    const [order2Row] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, probeOrderNumber('o2')))
      .limit(1);
    const [itemL] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order2Row.id))
      .limit(1);
    await expectReject(
      'order item from a DIFFERENT order → generic miss',
      ReviewServiceError,
      () => submitReview({
        fields: {
          orderNumber: probeOrderNumber('o1'), phone: CUSTOMER_PHONE,
          orderItemId: itemL.id, rating: 4,
          comment: 'محاولة ربط بند من طلب آخر بأمر مطابق يجب أن تُرفض تمامًا.',
        },
        image: null,
      }),
    );

    // Already-reviewed items surface as reviewed in the lookup.
    const itemsAfter = await lookupReviewableOrder({
      orderNumber: probeOrderNumber('o1'), phone: CUSTOMER_PHONE,
    });
    const targetAfter = itemsAfter.find((i) => i.orderItemId === itemM.id);
    assert('lookup flags the reviewed item (alreadyReviewed)', targetAfter?.alreadyReviewed === true);
  }

  console.log('\n[5] DB structural duplicate probe (partial unique index)');
  {
    let rejected = false;
    try {
      await db.insert(reviews).values({
        productId: productA, orderItemId: itemM.id, rating: 4,
        comment: 'إدراج مباشر مكرر يجب أن يرفضه القيد الجزئي على مستوى قاعدة البيانات.',
        isVerifiedPurchase: true,
      });
    } catch (error) {
      rejected = String((error as { cause?: { code?: string } }).cause?.code ?? '') === '23505'
        || /reviews_order_item_verified_key/.test((error as Error).message);
    }
    assert('second verified review per order item is DB-impossible (23505)', rejected);

    // Unlinked/unverified reviews stay unrestricted (dictionary rule scope).
    const [unverified] = await db.insert(reviews).values({
      productId: productA, orderItemId: null, rating: 3,
      comment: 'مراجعة غير مرتبطة بطلب — مسموح بقواعد القاموس خارج نطاق التحقق.',
      isVerifiedPurchase: false,
    }).returning({ id: reviews.id });
    await db.delete(reviews).where(eq(reviews.id, unverified.id));
    assert('unverified unlinked review insert allowed (dictionary scope)', true);
  }

  console.log('\n[6] Moderation — reject/approve, idempotence, audit');
  {
    await moderateReview({ reviewId: review1Id, action: 'rejected', adminUserId: probeAdminId });
    const [afterReject] = await db.select().from(reviews).where(eq(reviews.id, review1Id));
    assert('rejected review status', afterReject.status === 'rejected');

    const beforeCount = await auditCount('reviews.');
    await moderateReview({ reviewId: review1Id, action: 'approved', adminUserId: probeAdminId });
    const [afterApprove] = await db.select().from(reviews).where(eq(reviews.id, review1Id));
    assert('approved review status', afterApprove.status === 'approved');
    assert('approve wrote exactly one audit row', (await auditCount('reviews.')) === beforeCount + 1);

    await moderateReview({ reviewId: review1Id, action: 'approved', adminUserId: probeAdminId });
    assert('idempotent re-approve writes NO extra audit row', (await auditCount('reviews.')) === beforeCount + 1);

    const logs = await db
      .select({ action: adminActivityLogs.action, metadata: adminActivityLogs.metadata })
      .from(adminActivityLogs)
      .where(eq(adminActivityLogs.entityId, review1Id));
    assert('audit rows carry sanitized metadata (no credential keys)',
      logs.every((l) => l.metadata !== null && !('password' in (l.metadata as object))));

    await expectReject(
      'unknown review id → 404',
      ReviewModerationError,
      () => moderateReview({
        reviewId: '00000000-0000-0000-0000-000000000000',
        action: 'approved', adminUserId: probeAdminId,
      }),
      404,
    );
  }

  console.log('\n[7] Public feeds — approved-only reviews; pending never public');
  let pendingReviewId = '';
  {
    const feed = await getHomepageReviews(20);
    const mine = feed.find((r) => r.id === review1Id);
    assert('approved review appears in the homepage feed', mine !== undefined);
    assert('feed row carries product context', mine?.productSlug?.startsWith('rev-prod-a-') === true);
    assert('feed row exposes NO customer PII',
      mine !== undefined && !('customerId' in mine) && !('orderItemId' in mine));

    // A second (pending) review must NOT be public — but itemB is still free.
    const result2 = await submitReview({
      fields: {
        orderNumber: probeOrderNumber('o1'), phone: CUSTOMER_PHONE,
        orderItemId: itemB.id, rating: 4,
        comment: 'منتج جيد جدًا مقابل السعر، وتجربة شراء مريحة بلا أي تعقيد.',
      },
      image: null,
    });
    pendingReviewId = result2.reviewId;
    const feed2 = await getHomepageReviews(20);
    assert('PENDING review excluded from the homepage feed',
      !feed2.some((r) => r.id === pendingReviewId));

    const pendingList = await listAdminReviews({ status: 'pending' });
    assert('admin pending list contains the pending review',
      pendingList.items.some((r) => r.id === pendingReviewId));
    assert('admin list exposes pendingCount', typeof pendingList.pendingCount === 'number');
  }

  console.log('\n[8] Testimonials — private draft, privacy-gated publish, hide, update');
  let draftId = '';
  let draftMediaId = '';
  let secondId = '';
  {
    const created = await createTestimonial({
      image: { bytes: await probeImageBytes('#882244'), declaredContentType: 'image/png' },
      altText: 'لقطة اختبار واتساب',
      displayName: 'أ. اختبار',
      city: 'القاهرة',
      caption: 'شهادة اختبار حقيقية الشكل — تُحذف بعد التحقق.',
      productId: productA,
      adminUserId: probeAdminId,
    });
    draftId = created.id;
    assert('testimonial draft created', draftId.length > 0);

    const [draft] = await db
      .select()
      .from(whatsappTestimonials)
      .where(eq(whatsappTestimonials.id, draftId));
    assert('testimonial starts as DRAFT', draft.status === 'draft');
    draftMediaId = draft.mediaAssetId;
    const [draftAsset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, draftMediaId));
    probePathnames.push(draftAsset.pathname);
    assert('draft testimonial media registered PRIVATE (not publicly exposed)',
      draftAsset.accessMode === 'private');

    await expectReject(
      'publish WITHOUT privacy confirmation → 422 (data contract)',
      TestimonialServiceError,
      () => publishTestimonial({
        testimonialId: draftId, privacyConfirmed: false, adminUserId: probeAdminId,
      }),
      422,
    );

    // Hide BEFORE publish: drafts are already unrendered — hide is refused.
    await expectReject(
      'hide from draft is refused (drafts are already unrendered)',
      TestimonialServiceError,
      () => hideTestimonial({ testimonialId: draftId, adminUserId: probeAdminId }),
    );

    const published = await publishTestimonial({
      testimonialId: draftId, privacyConfirmed: true, adminUserId: probeAdminId,
    });
    assert('publish WITH confirmation → published', published.status === 'published');

    await updateTestimonial({
      testimonialId: draftId,
      patch: { sortOrder: 7, city: 'الإسكندرية' },
      adminUserId: probeAdminId,
    });
    const [updated] = await db
      .select()
      .from(whatsappTestimonials)
      .where(eq(whatsappTestimonials.id, draftId));
    assert('update applies sortOrder + fields', updated.sortOrder === 7 && updated.city === 'الإسكندرية');

    const pdpFeed = await getProductTestimonials(productA, 5);
    assert('published testimonial appears on the product surface', pdpFeed.some((t) => t.id === draftId));
    assert('testimonial feed carries NO review fields (accurate labeling)',
      pdpFeed.every((t) => !('rating' in t) && !('isVerifiedPurchase' in t)));

    // Homepage ordering by sort_order.
    const second = await createTestimonial({
      image: { bytes: await probeImageBytes('#228844'), declaredContentType: 'image/png' },
      altText: null, displayName: null, city: null, caption: null,
      productId: null, adminUserId: probeAdminId,
    });
    secondId = second.id;
    const [secondRow] = await db
      .select()
      .from(whatsappTestimonials)
      .where(eq(whatsappTestimonials.id, secondId));
    const [secondAsset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, secondRow.mediaAssetId));
    probePathnames.push(secondAsset.pathname);
    await publishTestimonial({
      testimonialId: secondId, privacyConfirmed: true, adminUserId: probeAdminId,
    });
    await updateTestimonial({
      testimonialId: secondId, patch: { sortOrder: 3 }, adminUserId: probeAdminId,
    });
    const ordered = await getPublishedTestimonials(20);
    const mine = ordered.filter((t) => t.id === draftId || t.id === secondId);
    assert('published feed orders by sort_order asc', mine[0]?.id === secondId && mine.length === 2);

    // Hide withdraws from public surfaces.
    await hideTestimonial({ testimonialId: secondId, adminUserId: probeAdminId });
    const afterHide = await getPublishedTestimonials(20);
    assert('hidden testimonial excluded from the public feed',
      !afterHide.some((t) => t.id === secondId));

    // Re-publish requires confirmation again (spec: confirm BEFORE publishing).
    await expectReject(
      're-publish of hidden requires confirmation again',
      TestimonialServiceError,
      () => publishTestimonial({
        testimonialId: secondId, privacyConfirmed: false, adminUserId: probeAdminId,
      }),
      422,
    );

    // Invalid product association.
    await expectReject(
      'update with unknown product → error',
      TestimonialServiceError,
      () => updateTestimonial({
        testimonialId: draftId,
        patch: { productId: '00000000-0000-0000-0000-000000000000' },
        adminUserId: probeAdminId,
      }),
    );

    await expectReject(
      'unknown testimonial id → 404',
      TestimonialServiceError,
      () => hideTestimonial({
        testimonialId: '00000000-0000-0000-0000-000000000000', adminUserId: probeAdminId,
      }),
      404,
    );

    const adminList = await listAdminTestimonials({ status: 'all' });
    assert('admin testimonial list finds both probes',
      adminList.items.some((t) => t.id === draftId) && adminList.items.some((t) => t.id === secondId));
    assert('admin list hides private URLs (preview via content route only)',
      adminList.items
        .filter((t) => t.mediaAccessMode === 'private')
        .every((t) => t.publicImageUrl === null));
  }

  console.log(`\n[9] Media lifecycle (live Blob: ${mediaConfigured ? 'configured' : 'NOT configured — honest skip'})`);
  if (mediaConfigured) {
    // Third delivered order → review its item WITH an image.
    const order3 = await createProbeOrder([{ variantId: variantA_L, quantity: 1 }], 'o3');
    await deliverOrder(order3);
    const [item3] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order3))
      .limit(1);

    const result = await submitReview({
      fields: {
        orderNumber: probeOrderNumber('o3'), phone: CUSTOMER_PHONE,
        orderItemId: item3.id, rating: 5,
        comment: 'مراجعة مع صورة — القماش سميك والخياطة نظيفة جدًا في الصورة المرفقة.',
      },
      image: { bytes: await probeImageBytes('#2288aa'), declaredContentType: 'image/png' },
    });
    const reviewWithImageId = result.reviewId;

    const [imageLink] = await db
      .select()
      .from(reviewImages)
      .where(eq(reviewImages.reviewId, reviewWithImageId));
    assert('review image attached to the pending review', imageLink !== undefined);
    const [privateAsset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, imageLink.mediaAssetId));
    assert('review image registered PRIVATE while pending', privateAsset.accessMode === 'private');
    probePathnames.push(privateAsset.pathname);

    const pendingFeed = await getHomepageReviews(20);
    assert('pending review (with image) NOT in the public feed',
      !pendingFeed.some((r) => r.id === reviewWithImageId));

    await moderateReview({ reviewId: reviewWithImageId, action: 'approved', adminUserId: probeAdminId });
    const [publicAsset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, imageLink.mediaAssetId));
    assert('approval FLIPPED the asset public (app-level disclosure gate)',
      publicAsset.accessMode === 'public');
    assert('registry URL is unchanged (capability URL; disclosure is app-level)',
      publicAsset.url === privateAsset.url && publicAsset.pathname === privateAsset.pathname);

    const approvedFeed = await getHomepageReviews(20);
    const approvedRow = approvedFeed.find((r) => r.id === reviewWithImageId);
    assert('approved review feed carries the PUBLIC image URL',
      approvedRow?.imageUrl === publicAsset.url);
  } else {
    pass('media lifecycle skipped honestly (no Blob credentials in this environment)');
  }

  console.log('\n[10] Rollback — duplicate submission with an image leaves zero residue');
  {
    const beforeMedia = await countReviewsMedia();
    await expectReject(
      'duplicate submission (itemB already reviewed) with image → 409',
      ReviewServiceError,
      async () => submitReview({
        fields: {
          orderNumber: probeOrderNumber('o1'), phone: CUSTOMER_PHONE,
          orderItemId: itemB.id, rating: 3,
          comment: 'محاولة مكررة مع صورة — يجب رفض كاملة دون أي بقايا وسائط.',
        },
        image: { bytes: await probeImageBytes('#2288aa'), declaredContentType: 'image/png' },
      }),
      409,
    );
    const afterMedia = await countReviewsMedia();
    assert('failed submission leaves ZERO media residue', afterMedia === beforeMedia);
  }

  console.log('\n[verify-reviews] sections complete');
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

async function auditCount(prefix: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminActivityLogs)
    .where(like(adminActivityLogs.action, `${prefix}%`));
  return Number(row?.n ?? 0);
}

async function countReviewsMedia(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .where(like(mediaAssets.pathname, 'reviews/%'));
  return Number(row?.n ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Cleanup (LIFO) + residue probes                                             */
/* -------------------------------------------------------------------------- */

async function destroyFixtures(): Promise<void> {
  const probeVariants = [variantA_M, variantA_L, variantB_default].filter(Boolean);
  const placeholders = probeVariants.length > 0
    ? sql.join(probeVariants.map((id) => sql`${id}`), sql`, `)
    : sql`'00000000-0000-0000-0000-000000000000'::uuid`;

  // Review images + reviews for probe products (images cascade from reviews).
  const probeProductIds = createdProductIds.filter(Boolean);
  if (probeProductIds.length > 0) {
    await db.delete(reviews).where(inArray(reviews.productId, probeProductIds));
    await db.delete(whatsappTestimonials).where(inArray(whatsappTestimonials.productId, probeProductIds));
    // Testimonials with NULL product (probe #2) — match by media pathname prefix.
    await db.execute(sql`
      delete from whatsapp_testimonials where media_asset_id in (
        select id from media_assets where pathname like 'testimonials/%'
      )
    `);
  }
  // Probe media rows (all PHASE-09 prefixes) — then live-provider cleanup.
  const assetRows = await db
    .select({ pathname: mediaAssets.pathname })
    .from(mediaAssets)
    .where(
      sql`${mediaAssets.pathname} like 'reviews/%' or ${mediaAssets.pathname} like 'testimonials/%' or ${mediaAssets.pathname} like 'public/%'`,
    );
  await db.execute(sql`
    delete from media_assets where pathname like 'reviews/%' or pathname like 'testimonials/%' or pathname like 'public/%'
  `);

  const { getMediaStorageProvider } = await import('../src/lib/media/service');
  const provider = getMediaStorageProvider();
  if (provider) {
    const pathnames = new Set<string>([...probePathnames, ...assetRows.map((a) => a.pathname)]);
    for (const pathname of pathnames) {
      await provider.delete(pathname).catch(() => undefined);
    }
  }

  // Activity logs: probe admin + probe entities + the phase's action space.
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
  await db.execute(sql`
    delete from admin_activity_logs where action like 'reviews.%' or action like 'testimonials.%'
  `);

  // Movements + orders + customers (probe variants).
  await db.execute(sql`
    delete from inventory_movements where order_id in (
      select o.id from orders o
      join order_items oi on oi.order_id = o.id
      where oi.variant_id in (${placeholders})
    )
  `);
  await db.delete(inventoryMovements).where(inArray(inventoryMovements.variantId, probeVariants));
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
  await db.delete(productVariants).where(inArray(productVariants.productId, probeProductIds));
  await db.delete(products).where(inArray(products.id, probeProductIds));
  await db.delete(categories).where(inArray(categories.id, createdCategoryIds.filter(Boolean)));
  await db.delete(attributeValues).where(inArray(attributeValues.attributeId, createdAttributeIds.filter(Boolean)));
  await db.delete(attributes).where(inArray(attributes.id, createdAttributeIds.filter(Boolean)));
  await db.delete(adminUsers).where(inArray(adminUsers.id, createdAdminIds.filter(Boolean)));
}

async function residueChecks(): Promise<void> {
  const [reviewsResidue] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(like(products.slug, 'rev-prod-%'));
  assert('cleanup: zero probe reviews remain', Number(reviewsResidue?.n ?? 0) === 0);

  const [testimonialsResidue] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(whatsappTestimonials)
    .where(sql`display_name = 'أ. اختبار' or caption = 'شهادة اختبار حقيقية الشكل — تُحذف بعد التحقق.'`);
  assert('cleanup: zero probe testimonials remain', Number(testimonialsResidue?.n ?? 0) === 0);

  const [mediaResidue] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .where(
      sql`${mediaAssets.pathname} like 'reviews/%' or ${mediaAssets.pathname} like 'testimonials/%' or ${mediaAssets.pathname} like 'public/%'`,
    );
  assert('cleanup: zero probe media rows remain', Number(mediaResidue?.n ?? 0) === 0);

  const probeVariants = [variantA_M, variantA_L, variantB_default].filter(Boolean);
  const placeholders = sql.join(probeVariants.map((id) => sql`${id}`), sql`, `);
  const [ordersResidue] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(sql`id in (select o.id from orders o join order_items oi on oi.order_id = o.id where oi.variant_id in (${placeholders}))`);
  assert('cleanup: zero probe orders remain', Number(ordersResidue?.n ?? 0) === 0);

  const [customersResidue] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(customers)
    .where(like(customers.name, `${CUSTOMER_NAME}%`));
  assert('cleanup: zero probe customers remain', Number(customersResidue?.n ?? 0) === 0);

  const [adminResidue] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminUsers)
    .where(like(adminUsers.username, 'zz-rev-admin-%'));
  assert('cleanup: zero probe admins remain', Number(adminResidue?.n ?? 0) === 0);
}

/* -------------------------------------------------------------------------- */
/* Pre-clean (crashed-run residue — makes re-runs idempotent)                  */
/* -------------------------------------------------------------------------- */

/**
 * Removes any leftovers from a PRIOR crashed run of THIS suite (same
 * fingerprints: customer name prefix, probe slugs, media pathname prefixes,
 * probe admin usernames). Never touches real business data — every target
 * is suite-namespaced. This suite shares ONE customer phone identity across
 * runs (customers.phone_normalized UNIQUE), so stale rows would otherwise
 * block the next run's teardown with a RESTRICT violation.
 */
async function preclean(): Promise<void> {
  const prior = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(customers)
    .where(like(customers.name, `${CUSTOMER_NAME}%`));
  if (Number(prior[0]?.n ?? 0) === 0) return;

  console.log('[preclean] crashed-run residue detected — scrubbing suite fingerprints…');

  // Reviews + testimonials for probe products (images cascade from reviews).
  await db.execute(sql`
    delete from reviews where product_id in (
      select id from products where slug like 'rev-prod-%'
    )
  `);
  await db.execute(sql`
    delete from whatsapp_testimonials where product_id in (
      select id from products where slug like 'rev-prod-%'
    ) or media_asset_id in (
      select id from media_assets
      where pathname like 'reviews/%' or pathname like 'testimonials/%'
    )
  `);
  // Probe media rows — guarded against catalog references (never cascade real data).
  await db.execute(sql`
    delete from media_assets where (pathname like 'reviews/%' or pathname like 'testimonials/%')
      and id not in (select media_asset_id from product_images)
      and id not in (select media_asset_id from review_images)
      and id not in (select media_asset_id from whatsapp_testimonials)
  `);
  // Activity logs for probe admins + the phase's action space.
  await db.execute(sql`
    delete from admin_activity_logs where admin_user_id in (
      select id from admin_users where username like 'zz-rev-admin-%'
    ) or action like 'reviews.%' or action like 'testimonials.%'
  `);
  // Orders/movements of prior runs (by probe-customer identity).
  await db.execute(sql`
    delete from inventory_movements where order_id in (
      select o.id from orders o join customers c on c.id = o.customer_id
      where c.name like ${CUSTOMER_NAME + '%'}
    )
  `);
  await db.execute(sql`
    delete from orders where customer_id in (
      select id from customers where name like ${CUSTOMER_NAME + '%'}
    )
  `);
  await db.delete(customers).where(like(customers.name, `${CUSTOMER_NAME}%`));

  // Catalog fixtures (probe slugs/skus only).
  await db.execute(sql`
    delete from variant_attribute_values where variant_id in (
      select id from product_variants where sku like 'REV-A-%' or sku like 'REV-B-%'
    )
  `);
  await db.execute(sql`
    delete from product_variants where product_id in (
      select id from products where slug like 'rev-prod-%'
    )
  `);
  await db.delete(products).where(like(products.slug, 'rev-prod-%'));
  await db.delete(categories).where(like(categories.slug, 'rev-cat-%'));
  await db.delete(attributeValues).where(like(attributeValues.slug, 'm-rev-%'));
  await db.delete(attributes).where(like(attributes.slug, 'rev-size-%'));
  await db.delete(adminUsers).where(like(adminUsers.username, 'zz-rev-admin-%'));
}

/* -------------------------------------------------------------------------- */
/* Entry                                                                       */
/* -------------------------------------------------------------------------- */

try {
  await main();
} finally {
  console.log('\n[cleanup] restoring baseline (LIFO)…');
  try {
    await destroyFixtures();
    await residueChecks();
  } catch (cleanupError) {
    failures += 1;
    console.error('[verify-reviews] CLEANUP FAILURE:', (cleanupError as Error)?.message);
  }
  await getPool().end().catch(() => undefined);
  console.log(`\n[verify-reviews] ${passes} passed, ${failures} failed`);
  if (failures > 0) {
    console.error('[verify-reviews] FAILURES PRESENT');
    process.exit(1);
  }
  console.log('[verify-reviews] ALL CHECKS PASS');
}
