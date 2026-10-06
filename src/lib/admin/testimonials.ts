/**
 * Amira Store — WhatsApp testimonials admin service (PHASE-09).
 *
 * MASTER_PLAN §15 + PHASE-09 spec: admin-only management of customer
 * WhatsApp screenshots. A WhatsApp testimonial is NEVER a site review — it
 * is a separate entity, separately labeled, and lives in its own table.
 *
 * Media privacy contract (PHASE-09 "unapproved screenshot media should not
 * be publicly exposed" + MASTER_PLAN §20):
 * - upload  → media asset registered PRIVATE (blob `access: 'private'`);
 *   unauthenticated callers can never reach the bytes — not via URL, not via
 *   any API surface (admin preview streams through an authenticated route);
 * - publish → requires the admin's EXPLICIT privacy confirmation (visible
 *   phone numbers / addresses / unrelated private content reviewed); the
 *   asset materializes PUBLIC (one provider copy hop) before the status
 *   flip commits;
 * - hidden  → the (already privacy-reviewed) asset stays public but is
 *   rendered by NO public surface; re-publishing requires confirmation
 *   again. Documented residual: a hidden item's underlying object remains
 *   CDN-readable via its unguessable URL — the privacy review happened at
 *   publish time and hide only withdraws it from store surfaces.
 *
 * Every mutation writes ONE sanitized audit row ATOMIC with the DB change.
 */

import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import {
  mediaAssets,
  products,
  whatsappTestimonials,
  type MediaAsset,
} from '@/db/schema';
import { recordAdminActivity } from '@/lib/auth/activity';
import { materializeMediaPublic, uploadImage } from '@/lib/media/service';

export class TestimonialServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'TestimonialServiceError';
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                               */
/* -------------------------------------------------------------------------- */

export const testimonialUpdateSchema = z.object({
  /** undefined = leave unchanged; empty string = clear (null). */
  displayName: z.string().trim().max(80, `الحد الأقصى 80 حرف.`).optional(),
  city: z.string().trim().max(80, `الحد الأقصى 80 حرف.`).optional(),
  caption: z.string().trim().max(300, `الحد الأقصى 300 حرف.`).optional(),
  /** null clears the product association; a value must reference a real product. */
  productId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export type TestimonialUpdateInput = z.infer<typeof testimonialUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Create (upload + register PRIVATE + draft)                                  */
/* -------------------------------------------------------------------------- */

export async function createTestimonial(input: {
  image: { bytes: Buffer; declaredContentType: string | null };
  altText: string | null;
  displayName: string | null;
  city: string | null;
  caption: string | null;
  productId: string | null;
  adminUserId: string;
}): Promise<{ id: string }> {
  if (input.productId) {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) throw new TestimonialServiceError('المنتج المرتبط غير موجود.');
  }

  // Private upload FIRST (orphan-prevention inside uploadImage), then the
  // testimonial row; a failed insert removes the asset best-effort so no
  // unreachable blob outlives the database.
  const asset = await uploadImage({
    bytes: input.image.bytes,
    declaredContentType: input.image.declaredContentType,
    altText: input.altText,
    adminUserId: input.adminUserId,
    accessMode: 'private',
    folder: 'testimonials',
  });

  try {
    const row = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(whatsappTestimonials)
        .values({
          productId: input.productId,
          displayName: input.displayName,
          city: input.city,
          caption: input.caption,
          mediaAssetId: asset.id,
          status: 'draft',
          sortOrder: 0,
        })
        .returning({ id: whatsappTestimonials.id });

      await recordAdminActivity(
        {
          adminUserId: input.adminUserId,
          action: 'testimonials.create',
          entityType: 'whatsapp_testimonial',
          entityId: inserted.id,
          metadata: { status: 'draft', mediaAccessMode: 'private' },
        },
        tx,
      );
      return inserted;
    });

    return { id: row.id };
  } catch (error) {
    await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
    const { getMediaStorageProvider } = await import('@/lib/media/service');
    const provider = getMediaStorageProvider();
    if (provider) await provider.delete(asset.pathname).catch(() => undefined);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Publish (privacy-confirmed) / hide                                          */
/* -------------------------------------------------------------------------- */

/**
 * Publish a draft (or re-publish a hidden) testimonial.
 * `privacyConfirmed` MUST be true — the admin confirms they reviewed the
 * screenshot for visible phone numbers, addresses, and unrelated private
 * content (PHASE-09 privacy check). The media materializes PUBLIC before the
 * status commits; a failed materialization leaves the item unpublished.
 */
export async function publishTestimonial(input: {
  testimonialId: string;
  privacyConfirmed: boolean;
  adminUserId: string;
}): Promise<{ status: 'published' }> {
  if (input.privacyConfirmed !== true) {
    throw new TestimonialServiceError(
      'لا يمكن النشر قبل تأكيد مراجعة لقطة الشاشة (أرقام الهواتف، العناوين، والمحتوى الخاص).',
    );
  }

  const { testimonial, asset } = await loadTestimonialWithAsset(input.testimonialId);
  if (!testimonial) throw new TestimonialServiceError('الشهادة غير موجودة.', 404);
  if (testimonial.status === 'published') {
    return { status: 'published' }; // idempotent re-publish
  }

  await materializeMediaPublic(asset);

  await db.transaction(async (tx) => {
    await tx
      .update(whatsappTestimonials)
      .set({ status: 'published', updatedAt: new Date() })
      .where(eq(whatsappTestimonials.id, testimonial.id));

    await recordAdminActivity(
      {
        adminUserId: input.adminUserId,
        action: 'testimonials.publish',
        entityType: 'whatsapp_testimonial',
        entityId: testimonial.id,
        metadata: {
          previousStatus: testimonial.status,
          privacyConfirmed: true,
        },
      },
      tx,
    );
  });

  return { status: 'published' };
}

/** Withdraw a published testimonial from all store surfaces. */
export async function hideTestimonial(input: {
  testimonialId: string;
  adminUserId: string;
}): Promise<{ status: 'hidden' }> {
  const { testimonial } = await loadTestimonialWithAsset(input.testimonialId);
  if (!testimonial) throw new TestimonialServiceError('الشهادة غير موجودة.', 404);
  if (testimonial.status === 'hidden') return { status: 'hidden' };
  if (testimonial.status !== 'published') {
    throw new TestimonialServiceError(
      'المسودات غير منشورة أصلًا — استخدم النشر للنشر أو احذف الارتباط.',
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(whatsappTestimonials)
      .set({ status: 'hidden', updatedAt: new Date() })
      .where(eq(whatsappTestimonials.id, testimonial.id));

    await recordAdminActivity(
      {
        adminUserId: input.adminUserId,
        action: 'testimonials.hide',
        entityType: 'whatsapp_testimonial',
        entityId: testimonial.id,
        metadata: { previousStatus: 'published' },
      },
      tx,
    );
  });

  return { status: 'hidden' };
}

/* -------------------------------------------------------------------------- */
/* Update (display fields + product association + sort order)                  */
/* -------------------------------------------------------------------------- */

export async function updateTestimonial(input: {
  testimonialId: string;
  patch: TestimonialUpdateInput;
  adminUserId: string;
}): Promise<{ ok: true }> {
  const { testimonial } = await loadTestimonialWithAsset(input.testimonialId);
  if (!testimonial) throw new TestimonialServiceError('الشهادة غير موجودة.', 404);

  let productId = testimonial.productId;
  if (input.patch.productId !== undefined) {
    if (input.patch.productId === null) {
      productId = null;
    } else {
      const [product] = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, input.patch.productId))
        .limit(1);
      if (!product) throw new TestimonialServiceError('المنتج المرتبط غير موجود.');
      productId = input.patch.productId;
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(whatsappTestimonials)
      .set({
        displayName:
          input.patch.displayName !== undefined
            ? input.patch.displayName.length > 0
              ? input.patch.displayName
              : null
            : testimonial.displayName,
        city:
          input.patch.city !== undefined
            ? input.patch.city.length > 0
              ? input.patch.city
              : null
            : testimonial.city,
        caption:
          input.patch.caption !== undefined
            ? input.patch.caption.length > 0
              ? input.patch.caption
              : null
            : testimonial.caption,
        productId,
        sortOrder:
          input.patch.sortOrder !== undefined
            ? input.patch.sortOrder
            : testimonial.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(whatsappTestimonials.id, testimonial.id));

    await recordAdminActivity(
      {
        adminUserId: input.adminUserId,
        action: 'testimonials.update',
        entityType: 'whatsapp_testimonial',
        entityId: testimonial.id,
        metadata: {
          fields: Object.keys(input.patch),
          sortOrder: input.patch.sortOrder,
        },
      },
      tx,
    );
  });

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Listing                                                                     */
/* -------------------------------------------------------------------------- */

export type AdminTestimonialListItem = {
  id: string;
  displayName: string | null;
  city: string | null;
  caption: string | null;
  status: 'draft' | 'published' | 'hidden';
  sortOrder: number;
  createdAt: Date;
  mediaAssetId: string;
  mediaAccessMode: 'public' | 'private';
  publicImageUrl: string | null;
  product: { id: string; name: string; slug: string } | null;
};

export async function listAdminTestimonials(input: {
  status: 'draft' | 'published' | 'hidden' | 'all';
  limit?: number;
}): Promise<{ items: AdminTestimonialListItem[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const where =
    input.status === 'all' ? undefined : eq(whatsappTestimonials.status, input.status);

  const rows = await db
    .select({
      id: whatsappTestimonials.id,
      displayName: whatsappTestimonials.displayName,
      city: whatsappTestimonials.city,
      caption: whatsappTestimonials.caption,
      status: whatsappTestimonials.status,
      sortOrder: whatsappTestimonials.sortOrder,
      createdAt: whatsappTestimonials.createdAt,
      mediaAssetId: mediaAssets.id,
      mediaAccessMode: mediaAssets.accessMode,
      mediaUrl: mediaAssets.url,
      productId: products.id,
      productName: products.name,
      productSlug: products.slug,
    })
    .from(whatsappTestimonials)
    .innerJoin(mediaAssets, eq(mediaAssets.id, whatsappTestimonials.mediaAssetId))
    .leftJoin(products, eq(products.id, whatsappTestimonials.productId))
    .where(where)
    .orderBy(whatsappTestimonials.sortOrder, desc(whatsappTestimonials.createdAt))
    .limit(limit);

  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(whatsappTestimonials);

  return {
    items: rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      city: row.city,
      caption: row.caption,
      status: row.status,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      mediaAssetId: row.mediaAssetId,
      mediaAccessMode: row.mediaAccessMode,
      // Private originals NEVER expose their URL to any surface — the admin
      // UI previews them through the authenticated content route instead.
      publicImageUrl: row.mediaAccessMode === 'public' ? row.mediaUrl : null,
      product:
        row.productId && row.productName && row.productSlug
          ? { id: row.productId, name: row.productName, slug: row.productSlug }
          : null,
    })),
    total: count?.total ?? 0,
  };
}

/** Distinct product options for the association picker (id + name only). */
export async function listTestimonialProductOptions(limit = 200): Promise<
  { id: string; name: string }[]
> {
  return db
    .select({ id: products.id, name: products.name })
    .from(products)
    .orderBy(products.name)
    .limit(limit);
}

/* -------------------------------------------------------------------------- */
/* Internal loader                                                             */
/* -------------------------------------------------------------------------- */

async function loadTestimonialWithAsset(
  testimonialId: string,
): Promise<{ testimonial: { id: string; status: string; productId: string | null; displayName: string | null; city: string | null; caption: string | null; sortOrder: number }; asset: MediaAsset } | { testimonial: null; asset: null }> {
  const [row] = await db
    .select({
      id: whatsappTestimonials.id,
      status: whatsappTestimonials.status,
      productId: whatsappTestimonials.productId,
      displayName: whatsappTestimonials.displayName,
      city: whatsappTestimonials.city,
      caption: whatsappTestimonials.caption,
      sortOrder: whatsappTestimonials.sortOrder,
      asset: mediaAssets,
    })
    .from(whatsappTestimonials)
    .innerJoin(mediaAssets, eq(mediaAssets.id, whatsappTestimonials.mediaAssetId))
    .where(eq(whatsappTestimonials.id, testimonialId))
    .limit(1);

  if (!row) return { testimonial: null, asset: null };
  return {
    testimonial: {
      id: row.id,
      status: row.status,
      productId: row.productId,
      displayName: row.displayName,
      city: row.city,
      caption: row.caption,
      sortOrder: row.sortOrder,
    },
    asset: row.asset,
  };
}
