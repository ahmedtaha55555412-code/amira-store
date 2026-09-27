/**
 * Amira Store — admin media upload API (PHASE-04 tasks 9 & 10).
 *
 * POST /api/admin/media/upload (multipart/form-data, field "file"):
 * - same-origin gate → session authorization → file validation
 *   (magic-byte mime sniffing, 8 MB ceiling, sharp dimensions) →
 *   provider put (Vercel Blob) → media_assets registration.
 * - When BLOB_READ_WRITE_TOKEN is absent the endpoint answers 503 with the
 *   exact remediation — the honest unconfigured state, never a silent
 *   fallback (MASTER_PLAN §20: Vercel Blob IS the media store).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { errorResponse, guardMutation } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import {
  isMediaUploadConfigured,
  MediaStorageUnavailableError,
  uploadImage,
} from '@/lib/media/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = guardMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();

    if (!isMediaUploadConfigured()) {
      throw new MediaStorageUnavailableError();
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'لم يتم إرفاق ملف.' }, { status: 400 });
    }

    const altRaw = form?.get('altText');
    const altText = typeof altRaw === 'string' && altRaw.trim() ? altRaw.trim().slice(0, 300) : null;

    const bytes = Buffer.from(await file.arrayBuffer());
    const asset = await uploadImage({
      bytes,
      declaredContentType: file.type || null,
      altText,
      adminUserId: session.admin.id,
    });

    return NextResponse.json({
      ok: true,
      asset: {
        id: asset.id,
        url: asset.url,
        pathname: asset.pathname,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        altText: asset.altText,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
