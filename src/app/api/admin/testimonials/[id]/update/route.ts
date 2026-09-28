/**
 * Amira Store — WhatsApp testimonial update endpoint (PHASE-09).
 *
 * POST /api/admin/testimonials/[id]/update — partial field updates:
 * { displayName?, city?, caption?, productId? (null clears), sortOrder? }
 * zod-validated; product association re-checked against live rows; one
 * sanitized audit row per change, atomic with the update.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse, guardJsonMutation, readJson } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { testimonialUpdateSchema, updateTestimonial } from '@/lib/admin/testimonials';

export const dynamic = 'force-dynamic';

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
      return NextResponse.json({ error: 'معرّف غير صالح.' }, { status: 400 });
    }

    const body = await readJson(_request);
    const parsed = testimonialUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' },
        { status: 400 },
      );
    }

    await updateTestimonial({
      testimonialId: id,
      patch: parsed.data,
      adminUserId: session.admin.id,
    });
    return NextResponse.json({ ok: true as const });
  } catch (error) {
    return errorResponse(error);
  }
}
