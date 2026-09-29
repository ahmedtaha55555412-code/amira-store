/**
 * Amira Store — admin homepage banners API (PHASE-10).
 *
 * GET /api/admin/homepage/banners → all banners (any state), display order.
 * POST /api/admin/homepage/banners (multipart/form-data):
 *   file (image, registered PUBLIC per D-4), title, subtitle?, ctaLabel?,
 *   ctaHref?, sortOrder?
 * → uploads through the media service, then inserts the banner INACTIVE
 *   (activation is an explicit admin action).
 *
 * Banners are hero imagery only — they never carry product-selection logic.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { errorResponse, guardMutation, jsonOk } from '@/lib/api/admin';
import { requireAdminMutation, requireAdminPage } from '@/lib/auth/guard';
import {
  bannerCreateSchema,
  createHomepageBanner,
  getAdminBanners,
} from '@/lib/admin/homepage';
import { uploadImage } from '@/lib/media/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminPage();

    const banners = await getAdminBanners();
    return jsonOk({ banners });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = guardMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'لم يتم إرفاق صورة البانر.' }, { status: 400 });
    }

    const str = (key: string) => {
      const v = form?.get(key);
      return typeof v === 'string' ? v : null;
    };

    const sortOrderRaw = str('sortOrder');
    const sortOrder = sortOrderRaw !== null && sortOrderRaw !== '' ? Number(sortOrderRaw) : 0;

    const input = bannerCreateSchema.parse({
      title: str('title') ?? '',
      subtitle: str('subtitle'),
      ctaLabel: str('ctaLabel'),
      ctaHref: str('ctaHref'),
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : -1,
    });

    // Upload FIRST (public store, D-4) then insert the banner row.
    const asset = await uploadImage({
      bytes: Buffer.from(await file.arrayBuffer()),
      declaredContentType: file.type || null,
      altText: input.title,
      adminUserId: session.admin.id,
      accessMode: 'public',
      folder: 'banners',
    });

    const created = await createHomepageBanner({
      title: input.title,
      subtitle: input.subtitle,
      ctaLabel: input.ctaLabel,
      ctaHref: input.ctaHref,
      sortOrder: input.sortOrder,
      mediaAssetId: asset.id,
      adminUserId: session.admin.id,
    });

    return jsonOk({ ok: true, id: created.id, mediaId: asset.id });
  } catch (error) {
    return errorResponse(error);
  }
}
