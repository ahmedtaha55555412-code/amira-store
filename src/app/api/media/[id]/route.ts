/**
 * Amira Store — public controlled media delivery route (PHASE-09 closure,
 * ISSUE-048 final model).
 *
 * GET /api/media/[id] — the ONLY public delivery path for private-store
 * originals (Vercel's documented private-blob delivery pattern: an
 * authenticated route streams the bytes server-side via get()).
 *
 * Disclosure contract — bytes flow ONLY when ALL gates pass:
 * 1. the registry row exists (404 otherwise — invalid/missing UUID);
 * 2. the asset's registry access_mode is 'public' (the owning domain's
 *    deliberate disclosure: moderation approval / privacy-confirmed publish);
 * 3. the OWNING entity's status permits delivery:
 *    - owned by a WhatsApp testimonial → that testimonial must be 'published'
 *      (a hidden testimonial's media is withdrawn from delivery);
 *    - owned by a review (review_images) → that review must be 'approved';
 *    - unowned → the registry flip is the gate (standalone public uploads);
 * 4. the object is a private-STORE pathname (namespace routing) — its bytes
 *    stream from the private store via server credentials; the provider URL
 *    is never publicly readable, so the original never leaves the private
 *    store. Public-store pathnames are redirected to their CDN URL (they are
 *    public by definition; the route is simply not linked for them).
 *
 * Responses are no-store so hide/reject withdraws delivery immediately.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { mediaAssets, reviewImages, reviews, whatsappTestimonials } from '@/db/schema';
import { errorResponse } from '@/lib/api/admin';
import { readPrivateMedia } from '@/lib/media/service';
import { MediaStorageUnavailableError } from '@/lib/media/types';
import { isPrivateStorePathname } from '@/lib/media/vercel-blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'معرّف غير صالح.' }, { status: 400 });
    }

    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, id))
      .limit(1);
    if (!asset) {
      return NextResponse.json({ error: 'الوسائط غير موجودة.' }, { status: 404 });
    }

    // Gate 2: registry disclosure flag (pending/draft originals never flow).
    if (asset.accessMode !== 'public') {
      return NextResponse.json({ error: 'الوسائط غير موجودة.' }, { status: 404 });
    }

    // Gate 3: owning-entity status. Ownership is disjoint (one asset row is
    // referenced by exactly one domain — registry guard), so both probes are
    // single-index lookups and each is decisive for its domain.
    const [testimonialRef] = await db
      .select({ status: whatsappTestimonials.status })
      .from(whatsappTestimonials)
      .where(eq(whatsappTestimonials.mediaAssetId, asset.id))
      .limit(1);
    if (testimonialRef && testimonialRef.status !== 'published') {
      return NextResponse.json({ error: 'الوسائط غير موجودة.' }, { status: 404 });
    }

    const [reviewRef] = await db
      .select({ status: reviews.status })
      .from(reviewImages)
      .innerJoin(reviews, eq(reviews.id, reviewImages.reviewId))
      .where(eq(reviewImages.mediaAssetId, asset.id))
      .limit(1);
    if (reviewRef && reviewRef.status !== 'approved') {
      return NextResponse.json({ error: 'الوسائط غير موجودة.' }, { status: 404 });
    }

    // Gate 4 + delivery: private-store originals stream from the private
    // store; public-store objects redirect to the CDN (never proxied here).
    if (!isPrivateStorePathname(asset.pathname)) {
      const origin = new URL(_request.url).origin;
      const target = new URL(asset.url, origin);
      return NextResponse.redirect(target, { status: 302 });
    }

    const content = await readPrivateMedia(asset);
    if (!content) {
      return NextResponse.json({ error: 'الوسائط غير موجودة.' }, { status: 404 });
    }

    return new NextResponse(content.stream, {
      status: 200,
      headers: {
        'Content-Type': content.contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof MediaStorageUnavailableError) {
      // Honest configuration error (private-store credentials absent) —
      // mapped explicitly: the shared helper's known-error table does not
      // carry this class.
      return NextResponse.json({ error: 'خدمة الوسائط غير مهيأة.' }, { status: 503 });
    }
    return errorResponse(error);
  }
}
