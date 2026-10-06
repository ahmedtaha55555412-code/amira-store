/**
 * Amira Store — WhatsApp testimonial create endpoint (PHASE-09).
 *
 * POST /api/admin/testimonials (multipart/form-data):
 *   file (screenshot), displayName?, city?, caption?, productId?, altText?
 *
 * The screenshot registers PRIVATE (never publicly exposed until publish),
 * the testimonial starts as a draft, and one sanitized audit row records the
 * creation. Admin-only: same-origin → session → provider/file validation.
 */

import {
  NextResponse,
  type NextRequest } from 'next/server';

import { errorResponse,
  guardMutation,
  jsonNoStore
} from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { createTestimonial } from '@/lib/admin/testimonials';
import { MAX_UPLOAD_BYTES, ImageValidationError } from '@/lib/media/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function optionalString(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = guardMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return jsonNoStore({ error: 'لم يتم إرفاق صورة.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ImageValidationError(
        `حجم الصورة يتجاوز الحد الأقصى (${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} ميغابايت).`,
      );
    }

    const productRaw = optionalString(form?.get('productId') ?? null, 64);
    const productId =
      productRaw && /^[0-9a-f-]{36}$/i.test(productRaw) ? productRaw : null;

    const result = await createTestimonial({
      image: {
        bytes: Buffer.from(await file.arrayBuffer()),
        declaredContentType: file.type || null,
      },
      altText: optionalString(form?.get('altText') ?? null, 300),
      displayName: optionalString(form?.get('displayName') ?? null, 80),
      city: optionalString(form?.get('city') ?? null, 80),
      caption: optionalString(form?.get('caption') ?? null, 300),
      productId,
      adminUserId: session.admin.id,
    });

    return jsonNoStore({ ok: true as const, id: result.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
