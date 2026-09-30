/**
 * Amira Store — customer review domain (PHASE-09).
 *
 * MASTER_PLAN §15 site-review flow without customer accounts:
 * order number + checkout phone → server-side ownership match → only
 * DELIVERED order items are eligible → rating 1–5 + comment + optional
 * image → pending moderation → admin approves/rejects → approved verified
 * reviews carry the «مشتري موثّق» label on public surfaces.
 *
 * Security posture (MASTER_PLAN §24):
 * - the submission route is the ONLY unauthenticated mutation this module
 *   serves; it is same-origin + multipart + zod-validated + rate-limited at
 *   the route (this service stays the single decision maker);
 * - wrong order number and wrong phone produce the SAME generic error — no
 *   order-existence oracle (§14 discipline);
 * - the client supplies ONLY identifiers and content: product id, verified
 *   flag, and status are SERVER-derived facts (never read from the request);
 * - duplicate verified reviews per order item are refused here AND
 *   structurally impossible at the DB (partial unique index,
 *   DATA_DICTIONARY decision #8);
 * - the optional image is stored PRIVATE (Vercel Blob) until moderation
 *   approves the review — unapproved media is never publicly exposed.
 *
 * Image-free submissions skip the storage path entirely (image upload is
 * bundled INTO the submission — there is no anonymous upload endpoint and
 * therefore no orphan-media window).
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import {
  customers,
  mediaAssets,
  orderItems,
  orders,
  products,
  reviewImages,
  reviews,
  whatsappTestimonials,
  type MediaAsset,
} from '@/db/schema';
import { uploadImage, publicDeliveryUrlSql } from '@/lib/media/service';

import { normalizeEgyptianPhone } from './whatsapp';

export class ReviewServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'ReviewServiceError';
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* Limits + request schemas                                                    */
/* -------------------------------------------------------------------------- */

export const REVIEW_COMMENT_MIN = 10;
export const REVIEW_COMMENT_MAX = 1000;
export const REVIEW_MAX_IMAGE_BYTES = 8 * 1024 * 1024; // mirrors media validation

/** AMR-XXXXXX (checkout alphabet); case-insensitive on input, stored uppercase. */
export const orderNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^AMR-[A-Z0-9]{6}$/, 'رقم الطلب غير صحيح — مثال: AMR-4KP7QX.');

export const reviewLookupSchema = z.object({
  orderNumber: orderNumberSchema,
  phone: z
    .string()
    .trim()
    .min(8, 'برجاء كتابة رقم موبايل مصري صحيح (مثال: 01012345678).')
    .max(25, 'برجاء كتابة رقم موبايل مصري صحيح (مثال: 01012345678).')
    .refine((value) => normalizeEgyptianPhone(value) !== null, {
      message: 'برجاء كتابة رقم موبايل مصري صحيح (مثال: 01012345678).',
    }),
});

export const reviewSubmissionSchema = reviewLookupSchema.extend({
  orderItemId: z.string().uuid('بنود الطلب غير صالحة.'),
  rating: z
    .number()
    .int()
    .min(1, 'التقييم من ١ إلى ٥ نجوم.')
    .max(5, 'التقييم من ١ إلى ٥ نجوم.'),
  comment: z
    .string()
    .trim()
    .min(REVIEW_COMMENT_MIN, `التقييم قصير جدًا — اكتب ${REVIEW_COMMENT_MIN} أحرف على الأقل.`)
    .max(REVIEW_COMMENT_MAX, `التقييم طويل جدًا — الحد الأقصى ${REVIEW_COMMENT_MAX} حرف.`),
});

export type ReviewLookupInput = z.infer<typeof reviewLookupSchema>;
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;

/** Generic failure for EVERY order-matching miss — identical for all causes. */
const ORDER_MATCH_ERROR =
  'لم نتمكن من التحقق من الطلب. تأكد من رقم الطلب ورقم الموبايل المستخدم في الشراء.';

/* -------------------------------------------------------------------------- */
/* Step 1 — order lookup (delivered items only, no PII echo)                   */
/* -------------------------------------------------------------------------- */

export type ReviewableOrderItem = {
  orderItemId: string;
  productName: string;
  attributesLabel: string | null;
  quantity: number;
  /** Whether a verified review already exists for this item. */
  alreadyReviewed: boolean;
};

/**
 * Match an order by number + checkout phone and return its DELIVERED items
 * with review-state. Any miss (unknown number, phone mismatch, order not
 * delivered, order empty) raises the SAME generic error — the caller cannot
 * distinguish which check failed.
 */
export async function lookupReviewableOrder(
  input: ReviewLookupInput,
): Promise<ReviewableOrderItem[]> {
  const phone = normalizeEgyptianPhone(input.phone);
  if (!phone) throw new ReviewServiceError(ORDER_MATCH_ERROR);

  const [order] = await db
    .select({
      id: orders.id,
      shippingStatus: orders.shippingStatus,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(eq(orders.orderNumber, input.orderNumber))
    .limit(1);

  if (!order) throw new ReviewServiceError(ORDER_MATCH_ERROR);

  // Phone authority is customers.phone_normalized (canonical +20 form) —
  // the order snapshot keeps what was TYPED, this is what was VERIFIED.
  const [customer] = await db
    .select({ phoneNormalized: customers.phoneNormalized })
    .from(customers)
    .where(eq(customers.id, order.customerId))
    .limit(1);
  if (!customer || customer.phoneNormalized !== phone) {
    throw new ReviewServiceError(ORDER_MATCH_ERROR);
  }

  // "Only delivered order items are eligible by default" (PHASE-09 spec).
  if (order.shippingStatus !== 'delivered') {
    throw new ReviewServiceError(
      'التقييم متاح بعد تسليم الطلب — تقييم الطلبات المسلَّمة فقط.',
    );
  }

  const items = await db
    .select({
      orderItemId: orderItems.id,
      productName: orderItems.productNameSnapshot,
      attributesSnapshot: orderItems.variantAttributesSnapshot,
      quantity: orderItems.quantity,
      variantId: orderItems.variantId,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  if (items.length === 0) throw new ReviewServiceError(ORDER_MATCH_ERROR);

  const itemIds = items.map((item) => item.orderItemId);
  const reviewedRows = await db
    .select({ orderItemId: reviews.orderItemId })
    .from(reviews)
    .where(
      and(
        inArray(reviews.orderItemId, itemIds),
        eq(reviews.isVerifiedPurchase, true),
      ),
    );
  const reviewedSet = new Set(reviewedRows.map((row) => row.orderItemId));

  return items.map((item) => {
    const snapshot = item.attributesSnapshot;
    const parts = Array.isArray(snapshot)
      ? snapshot
          .map((entry) =>
            entry && typeof entry === 'object' && 'value' in entry
              ? String((entry as { value: unknown }).value)
              : null,
          )
          .filter((value): value is string => Boolean(value))
      : [];
    return {
      orderItemId: item.orderItemId,
      productName: item.productName,
      attributesLabel: parts.length > 0 ? parts.join(' · ') : null,
      quantity: item.quantity,
      alreadyReviewed: reviewedSet.has(item.orderItemId),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Step 2 — submission (pending moderation, optional PRIVATE image)            */
/* -------------------------------------------------------------------------- */

export type SubmitReviewImage = {
  bytes: Buffer;
  declaredContentType: string | null;
};

/**
 * Create a PENDING verified-purchase review for one delivered order item.
 * Runs the full eligibility matrix server-side again (the lookup endpoint is
 * never authoritative for the write path), then inserts the review + optional
 * private image atomically. The image is uploaded BEFORE the transaction and
 * rolled back best-effort if the transaction fails (orphan prevention).
 */
export async function submitReview(input: {
  fields: ReviewSubmissionInput;
  image?: SubmitReviewImage | null;
}): Promise<{ reviewId: string }> {
  const { fields } = input;
  const phone = normalizeEgyptianPhone(fields.phone);
  if (!phone) throw new ReviewServiceError(ORDER_MATCH_ERROR);

  // --- full server-side re-validation (write path authority) ---------------
  const [order] = await db
    .select({
      id: orders.id,
      shippingStatus: orders.shippingStatus,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(eq(orders.orderNumber, fields.orderNumber))
    .limit(1);
  if (!order) throw new ReviewServiceError(ORDER_MATCH_ERROR);

  const [customer] = await db
    .select({ phoneNormalized: customers.phoneNormalized })
    .from(customers)
    .where(eq(customers.id, order.customerId))
    .limit(1);
  if (!customer || customer.phoneNormalized !== phone) {
    throw new ReviewServiceError(ORDER_MATCH_ERROR);
  }
  if (order.shippingStatus !== 'delivered') {
    throw new ReviewServiceError(
      'التقييم متاح بعد تسليم الطلب — تقييم الطلبات المسلَّمة فقط.',
    );
  }

  const [item] = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      productId: orderItems.productId,
    })
    .from(orderItems)
    .where(eq(orderItems.id, fields.orderItemId))
    .limit(1);
  // The item must belong to the MATCHED order — a foreign id is a generic miss.
  if (!item || item.orderId !== order.id) {
    throw new ReviewServiceError(ORDER_MATCH_ERROR);
  }

  // Duplicate prevention: one verified review per order item (friendly error
  // here; the DB partial unique index makes the race structurally impossible).
  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        eq(reviews.orderItemId, item.id),
        eq(reviews.isVerifiedPurchase, true),
      ),
    )
    .limit(1);
  if (existing) {
    throw new ReviewServiceError(
      'تم تقييم هذا المنتج من نفس الطلب مسبقًا — مراجعة واحدة لكل منتج لكل طلب.',
      409,
    );
  }

  // --- optional image: PRIVATE until moderation approves --------------------
  let imageAsset: MediaAsset | null = null;
  if (input.image && input.image.bytes.length > 0) {
    imageAsset = await uploadImage({
      bytes: input.image.bytes,
      declaredContentType: input.image.declaredContentType,
      altText: null,
      adminUserId: null, // customer-submitted media — no admin attribution
      accessMode: 'private',
      folder: 'reviews',
    });
  }

  try {
    return await db.transaction(async (tx) => {
      const [review] = await tx
        .insert(reviews)
        .values({
          productId: item.productId,
          orderItemId: item.id,
          customerId: order.customerId,
          rating: fields.rating,
          comment: fields.comment,
          status: 'pending',
          isVerifiedPurchase: true,
        })
        .returning({ id: reviews.id });

      if (imageAsset) {
        await tx.insert(reviewImages).values({
          reviewId: review.id,
          mediaAssetId: imageAsset.id,
          sortOrder: 0,
        });
      }

      return { reviewId: review.id };
    });
  } catch (error) {
    // Unique-violation race (two concurrent submissions of the same item):
    // 23505 on reviews_order_item_verified_key → honest duplicate error.
    const message = (error as { message?: string; cause?: { code?: string } }) ?? {};
    if (message.cause?.code === '23505' || /reviews_order_item_verified_key/.test(message.message ?? '')) {
      if (imageAsset) {
        await cleanupAbandonedImage(imageAsset.id).catch(() => undefined);
      }
      throw new ReviewServiceError(
        'تم تقييم هذا المنتج من نفس الطلب مسبقًا — مراجعة واحدة لكل منتج لكل طلب.',
        409,
      );
    }
    // Any other failure: roll the private image back best-effort so no
    // unreachable blob outlives the failed submission.
    if (imageAsset) {
      await cleanupAbandonedImage(imageAsset.id).catch(() => undefined);
    }
    throw error;
  }
}

/** Remove an orphaned private image after a failed submission (best-effort). */
async function cleanupAbandonedImage(mediaAssetId: string): Promise<void> {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaAssetId))
    .limit(1);
  if (!asset) return;
  await db.delete(mediaAssets).where(eq(mediaAssets.id, mediaAssetId));
  const { getMediaStorageProvider } = await import('@/lib/media/service');
  const provider = getMediaStorageProvider();
  if (provider) await provider.delete(asset.pathname).catch(() => undefined);
}

/* -------------------------------------------------------------------------- */
/* Public feeds (approved reviews / published testimonials ONLY)               */
/* -------------------------------------------------------------------------- */

export type PublicReviewCard = {
  id: string;
  rating: number;
  comment: string;
  isVerifiedPurchase: boolean;
  createdAt: Date;
  productName: string;
  productSlug: string;
  imageUrl: string | null;
};

export type PublicTestimonialCard = {
  id: string;
  displayName: string | null;
  city: string | null;
  caption: string | null;
  imageUrl: string;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  productSlug: string | null;
  productName: string | null;
};

/** Latest approved reviews with product context — homepage social proof. */
export async function getHomepageReviews(limit = 6): Promise<PublicReviewCard[]> {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      isVerifiedPurchase: reviews.isVerifiedPurchase,
      createdAt: reviews.createdAt,
      productName: products.name,
      productSlug: products.slug,
      // Fully-qualified static correlated reference (see catalog.ts note).
      // ISSUE-048 final model: private-store originals deliver via the app
      // route (single mapping definition in the media service) — the CDN
      // URL of a private-store object is never publicly readable.
      imageUrl: sql<string | null>`(
        select ${publicDeliveryUrlSql(sql`mi.id`, sql`mi.pathname`, sql`mi.url`)} from review_images ri
        join media_assets mi on mi.id = ri.media_asset_id
        where ri.review_id = "reviews"."id" and mi.access_mode = 'public'
        order by ri.sort_order asc
        limit 1
      )`,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.status, 'approved'))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
  return rows;
}

/**
 * Published WhatsApp testimonials in display order — homepage section.
 * Draft/hidden items are structurally excluded; their media never reaches a
 * public render surface (and stays PRIVATE until first publish).
 */
export async function getPublishedTestimonials(limit = 6): Promise<PublicTestimonialCard[]> {
  const rows = await db
    .select({
      id: whatsappTestimonials.id,
      displayName: whatsappTestimonials.displayName,
      city: whatsappTestimonials.city,
      caption: whatsappTestimonials.caption,
      // ISSUE-048 final model: private-store originals deliver via the
      // app route; public-store assets keep their CDN URL.
      imageUrl: publicDeliveryUrlSql(mediaAssets.id, mediaAssets.pathname, mediaAssets.url),
      imageAlt: mediaAssets.altText,
      imageWidth: mediaAssets.width,
      imageHeight: mediaAssets.height,
      productSlug: products.slug,
      productName: products.name,
    })
    .from(whatsappTestimonials)
    .innerJoin(mediaAssets, eq(mediaAssets.id, whatsappTestimonials.mediaAssetId))
    .leftJoin(products, eq(products.id, whatsappTestimonials.productId))
    .where(eq(whatsappTestimonials.status, 'published'))
    .orderBy(whatsappTestimonials.sortOrder, desc(whatsappTestimonials.createdAt))
    .limit(limit);
  return rows;
}

/** Published testimonials linked to ONE product — PDP section. */
export async function getProductTestimonials(
  productId: string,
  limit = 3,
): Promise<PublicTestimonialCard[]> {
  const rows = await db
    .select({
      id: whatsappTestimonials.id,
      displayName: whatsappTestimonials.displayName,
      city: whatsappTestimonials.city,
      caption: whatsappTestimonials.caption,
      // ISSUE-048 final model: private-store originals deliver via the
      // app route; public-store assets keep their CDN URL.
      imageUrl: publicDeliveryUrlSql(mediaAssets.id, mediaAssets.pathname, mediaAssets.url),
      imageAlt: mediaAssets.altText,
      imageWidth: mediaAssets.width,
      imageHeight: mediaAssets.height,
      productSlug: products.slug,
      productName: products.name,
    })
    .from(whatsappTestimonials)
    .innerJoin(mediaAssets, eq(mediaAssets.id, whatsappTestimonials.mediaAssetId))
    .leftJoin(products, eq(products.id, whatsappTestimonials.productId))
    .where(
      and(
        eq(whatsappTestimonials.status, 'published'),
        eq(whatsappTestimonials.productId, productId),
      ),
    )
    .orderBy(whatsappTestimonials.sortOrder, desc(whatsappTestimonials.createdAt))
    .limit(limit);
  return rows;
}

/** Per-instance review-submission rate limiting (§24) — checkout pattern. */
const REVIEW_RATE_WINDOW_MS = 30 * 60_000;
const REVIEW_RATE_MAX_ATTEMPTS = 8;
const REVIEW_RATE_MAX_KEYS = 5_000;

const reviewRateBuckets = new Map<string, number[]>();

/**
 * Sliding-window limiter keyed by a HASHED client IP (raw addresses are never
 * stored). Local-memory = per serverless instance — a documented baseline
 * deterrent, not a distributed control. Returns true when allowed.
 */
export function reviewSubmissionRateLimit(key: string, now = Date.now()): boolean {
  let stamps = reviewRateBuckets.get(key);
  if (!stamps) {
    if (reviewRateBuckets.size >= REVIEW_RATE_MAX_KEYS) {
      const oldest = [...reviewRateBuckets.entries()].sort(
        (a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0),
      )[0];
      if (oldest) reviewRateBuckets.delete(oldest[0]);
    }
    stamps = [];
    reviewRateBuckets.set(key, stamps);
  }
  const cutoff = now - REVIEW_RATE_WINDOW_MS;
  while (stamps.length > 0 && stamps[0]! < cutoff) stamps.shift();
  if (stamps.length >= REVIEW_RATE_MAX_ATTEMPTS) return false;
  stamps.push(now);
  return true;
}
