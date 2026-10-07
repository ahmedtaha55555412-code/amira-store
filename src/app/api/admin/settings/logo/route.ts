/**
 * Amira Store — admin store logo media API (PHASE-10, decision D-4).
 *
 * POST    /api/admin/settings/logo  (multipart/form-data, field "file")
 *   → uploads a PUBLIC image via the media service and assigns it as the
 *     store logo atomically (settings row update + one sanitized audit row).
 * DELETE  /api/admin/settings/logo  → resets to the built-in brand default.
 *
 * Public media only: the uploaded asset is registered `public` (D-4 — logo
 * and favicon are storefront-public surfaces; the PHASE-09 private-media
 * architecture is untouched).
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
import { getStoreSettings, updateStoreLogo } from '@/lib/admin/settings';
import { MediaStorageUnavailableError, uploadImage } from '@/lib/media/service';
import { MAX_UPLOAD_BYTES, ImageValidationError } from '@/lib/media/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminMutation();
    const row = await getStoreSettings();
    return jsonOk({ logoMediaId: row?.logoMediaId ?? null });
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
      altText: altText ?? 'شعار المتجر',
      adminUserId: session.admin.id,
      accessMode: 'public', // D-4: branding surfaces are public media only
      folder: 'branding',
    });

    await updateStoreLogo(asset.id, session.admin.id);

    return jsonOk({ ok: true, mediaId: asset.id, url: asset.url });
  } catch (error) {
    // MediaStorageUnavailableError maps to the honest 503 via errorResponse.
    return errorResponse(error instanceof Error ? error : new Error('unknown'));
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    const session = await requireAdminMutation();
    await updateStoreLogo(null, session.admin.id);
    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}
