/**
 * Amira Store — WhatsApp testimonial publish endpoint (PHASE-09).
 *
 * POST /api/admin/testimonials/[id]/publish { privacyConfirmed: boolean }
 *
 * The PHASE-09 privacy gate: publishing REQUIRES the admin's explicit
 * confirmation that the screenshot was reviewed for visible phone numbers,
 * addresses, and unrelated private content. `privacyConfirmed: false` (or
 * missing) is refused 422 — the confirmation is a DATA point of the contract,
 * not a UI-only checkbox. The status and media-registry disclosure commit
 * atomically, and one sanitized audit row records the confirmation.
 */

import {
  NextResponse,
  type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse,
  guardJsonMutation,
  readJson,
  jsonNoStore
} from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { publishTestimonial } from '@/lib/admin/testimonials';

export const dynamic = 'force-dynamic';

const publishSchema = z.object({
  privacyConfirmed: z.literal(true, {
    message: 'لا يمكن النشر قبل تأكيد مراجعة لقطة الشاشة.',
  }),
});

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = guardJsonMutation(_request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return jsonNoStore({ error: 'معرّف غير صالح.' }, { status: 400 });
    }

    const body = await readJson(_request);
    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) {
      return jsonNoStore(
        { error: parsed.error.issues[0]?.message ?? 'التأكيد مطلوب قبل النشر.' },
        { status: 422 },
      );
    }

    const result = await publishTestimonial({
      testimonialId: id,
      privacyConfirmed: parsed.data.privacyConfirmed,
      adminUserId: session.admin.id,
    });
    return jsonNoStore({ ok: true as const, status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}
