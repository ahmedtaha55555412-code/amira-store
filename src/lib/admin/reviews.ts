/**
 * Amira Store — admin review moderation (PHASE-09).
 *
 * MASTER_PLAN §15: reviews are moderated (pending → approved | rejected) and
 * approved verified reviews display «مشتري موثّق» on public surfaces.
 *
 * Media contract (PHASE-09): a review's optional customer image is stored
 * PRIVATE until approval; approving materializes a PUBLIC copy (one provider
 * `copy()` hop) BEFORE the status flip commits, so an approved review never
 * renders a broken/private image. Rejection leaves the media private and
 * unrendered. Every moderation writes ONE sanitized audit row ATOMIC with the
 * status change (PHASE-03 activity pattern).
 */

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  mediaAssets,
  orderItems,
  products,
  reviewImages,
  reviews,
} from '@/db/schema';
import { materializeMediaPublic } from '@/lib/media/service';
import { recordAdminActivity } from '@/lib/auth/activity';

export class ReviewModerationError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'ReviewModerationError';
    this.status = status;
  }
}

export type ReviewModerationAction = 'approved' | 'rejected';
export type AdminReviewStatus = 'pending' | 'approved' | 'rejected';

export type AdminReviewListItem = {
  id: string;
  rating: number;
  comment: string;
  status: AdminReviewStatus;
  isVerifiedPurchase: boolean;
  createdAt: Date;
  productId: string;
  productName: string;
  productSlug: string;
  orderNumber: string | null;
  image: { mediaAssetId: string; accessMode: 'public' | 'private' } | null;
};

export async function listAdminReviews(input: {
  status: AdminReviewStatus | 'all';
  limit?: number;
  /** 1-based page (PHASE-12 list pagination); clamped ≥ 1. */
  page?: number;
}): Promise<{ items: AdminReviewListItem[]; total: number; pendingCount: number }> {
  const limit = Math.min(Math.max(input.limit ?? 60, 1), 200);
  const page = Math.max(input.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const where =
    input.status === 'all' ? undefined : eq(reviews.status, input.status);

  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      status: reviews.status,
      isVerifiedPurchase: reviews.isVerifiedPurchase,
      createdAt: reviews.createdAt,
      productId: products.id,
      productName: products.name,
      productSlug: products.slug,
      orderNumber: sql<string | null>`(
        select o.order_number from orders o
        where o.id = (select oi.order_id from order_items oi where oi.id = ${reviews.orderItemId})
      )`,
      imageMediaAssetId: sql<string | null>`(
        select ri.media_asset_id from review_images ri
        where ri.review_id = ${reviews.id} order by ri.sort_order asc limit 1
      )`,
      imageAccessMode: sql<'public' | 'private' | null>`(
        select ma.access_mode from review_images ri
        join media_assets ma on ma.id = ri.media_asset_id
        where ri.review_id = ${reviews.id} order by ri.sort_order asc limit 1
      )`,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(where)
    .orderBy(desc(reviews.createdAt))
    .limit(limit)
    .offset(offset);

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${reviews.status} = 'pending')::int`,
    })
    .from(reviews);

  return {
    items: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      status: row.status,
      isVerifiedPurchase: row.isVerifiedPurchase,
      createdAt: row.createdAt,
      productId: row.productId,
      productName: row.productName,
      productSlug: row.productSlug,
      orderNumber: row.orderNumber,
      image:
        row.imageMediaAssetId && row.imageAccessMode
          ? { mediaAssetId: row.imageMediaAssetId, accessMode: row.imageAccessMode }
          : null,
    })),
    total: counts?.total ?? 0,
    pendingCount: counts?.pending ?? 0,
  };
}

/**
 * Approve or reject one review.
 * - approve: materialize the review image PUBLIC first (idempotent), then
 *   flip status + audit atomically. A materialization failure leaves the
 *   review pending and is retryable.
 * - reject: status + audit atomically; media stays private forever-unrendered
 *   (the guarded media delete still protects the referenced asset).
 */
export async function moderateReview(input: {
  reviewId: string;
  action: ReviewModerationAction;
  adminUserId: string;
}): Promise<{ status: AdminReviewStatus }> {
  const [review] = await db
    .select({
      id: reviews.id,
      status: reviews.status,
      productName: products.name,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.id, input.reviewId))
    .limit(1);
  if (!review) throw new ReviewModerationError('المراجعة غير موجودة.', 404);

  if (review.status === input.action) {
    // Idempotent re-submission: nothing to change, nothing to audit.
    return { status: review.status };
  }

  if (input.action === 'approved') {
    const images = await db
      .select({ mediaAssetId: reviewImages.mediaAssetId })
      .from(reviewImages)
      .where(eq(reviewImages.reviewId, review.id));

    for (const image of images) {
      const [asset] = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, image.mediaAssetId))
        .limit(1);
      if (asset) await materializeMediaPublic(asset);
    }
  }

  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(reviews)
        .set({ status: input.action, updatedAt: new Date() })
        .where(eq(reviews.id, review.id))
        .returning({ status: reviews.status });

      await recordAdminActivity(
        {
          adminUserId: input.adminUserId,
          action: input.action === 'approved' ? 'reviews.approve' : 'reviews.reject',
          entityType: 'review',
          entityId: review.id,
          metadata: {
            action: input.action,
            previousStatus: review.status,
            productName: review.productName,
          },
        },
        tx,
      );

      return { status: updated.status };
    });
  } catch (error) {
    // If the status flip failed after materialization, the image may now be
    // public while the review is still pending — a HARMLESS residual (the
    // image belongs to a real verified purchase and renders nowhere until
    // approval); the next successful moderation re-runs the idempotent path.
    throw error;
  }
}

/** Full admin detail for one review (order-item snapshot context included). */
export async function getAdminReviewDetail(reviewId: string): Promise<{
  id: string;
  rating: number;
  comment: string;
  status: AdminReviewStatus;
  isVerifiedPurchase: boolean;
  createdAt: Date;
  product: { id: string; name: string; slug: string };
  orderItem: {
    id: string;
    productNameSnapshot: string;
    skuSnapshot: string | null;
    quantity: number;
    attributesLabel: string | null;
    orderNumber: string | null;
  } | null;
  images: { mediaAssetId: string; accessMode: 'public' | 'private'; url: string | null }[];
} | null> {
  const [row] = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      status: reviews.status,
      isVerifiedPurchase: reviews.isVerifiedPurchase,
      createdAt: reviews.createdAt,
      productId: products.id,
      productName: products.name,
      productSlug: products.slug,
      orderItemId: orderItems.id,
      productNameSnapshot: orderItems.productNameSnapshot,
      skuSnapshot: orderItems.skuSnapshot,
      quantity: orderItems.quantity,
      attributesSnapshot: orderItems.variantAttributesSnapshot,
      orderNumber: sql<string | null>`(
        select o.order_number from orders o
        where o.id = ${orderItems.orderId}
      )`,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .leftJoin(orderItems, eq(orderItems.id, reviews.orderItemId))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!row) return null;

  const images = await db
    .select({
      mediaAssetId: mediaAssets.id,
      accessMode: mediaAssets.accessMode,
      url: mediaAssets.url,
    })
    .from(reviewImages)
    .innerJoin(mediaAssets, eq(mediaAssets.id, reviewImages.mediaAssetId))
    .where(eq(reviewImages.reviewId, reviewId))
    .orderBy(reviewImages.sortOrder);

  const snapshot = row.attributesSnapshot;
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
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    isVerifiedPurchase: row.isVerifiedPurchase,
    createdAt: row.createdAt,
    product: { id: row.productId, name: row.productName, slug: row.productSlug },
    orderItem:
      row.orderItemId && row.productNameSnapshot
        ? {
            id: row.orderItemId,
            productNameSnapshot: row.productNameSnapshot,
            skuSnapshot: row.skuSnapshot,
            quantity: row.quantity ?? 0,
            attributesLabel: parts.length > 0 ? parts.join(' · ') : null,
            orderNumber: row.orderNumber,
          }
        : null,
    images: images.map((image) => ({
      mediaAssetId: image.mediaAssetId,
      accessMode: image.accessMode,
      url: image.accessMode === 'public' ? image.url : null,
    })),
  };
}

/** Admin-facing count helper for the dashboard (pending moderation queue). */
export async function countPendingReviews(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(and(eq(reviews.status, 'pending')));
  return row?.n ?? 0;
}
