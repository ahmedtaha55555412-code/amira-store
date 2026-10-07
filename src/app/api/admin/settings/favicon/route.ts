/**
 * Amira Store — admin store favicon media API (PHASE-10, decision D-4).
 *
 * POST    /api/admin/settings/favicon  (multipart/form-data, field "file")
 *   → uploads a PUBLIC image and assigns it as the store favicon atomically.
 * DELETE  /api/admin/settings/favicon  → resets to the built-in icon.
 *
 * Public media only (D-4); identical contract to the logo route.
 */

import {
  NextResponse,
  type NextRequest } from 'next/server';

import { errorResponse,
  guardMutation,
  jsonOk,
  jsonNoStore
} from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { getStoreSettings, updateStoreFavicon } from '@/lib/admin/settings';
import { uploadImage } from '@/lib/media/service';
import { MAX_UPLOAD_BYTES, ImageValidationError } from '@/lib/media/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminMutation();
    const row = await getStoreSettings();
    return jsonOk({ faviconMediaId: row?.faviconMediaId ?? null });
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
      return jsonNoStore({ error: 'لم يتم إرفاق ملف.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ImageValidationError(
        `حجم الصورة يتجاوز الحد الأقصى (${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} ميغابايت).`,
      );
    }

    const altRaw = form?.get('altText');
    const altText =
      typeof altRaw === 'string' && altRaw.trim() ? altRaw.trim().slice(0, 300) : null;

    const asset = await uploadImage({
      bytes: Buffer.from(await file.arrayBuffer()),
      declaredContentType: file.type || null,
      altText: altText ?? 'أيقونة المتجر',
      adminUserId: session.admin.id,
      accessMode: 'public', // D-4
      folder: 'branding',
    });

    await updateStoreFavicon(asset.id, session.admin.id);

    return jsonOk({ ok: true, mediaId: asset.id, url: asset.url });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    const session = await requireAdminMutation();
    await updateStoreFavicon(null, session.admin.id);
    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}
