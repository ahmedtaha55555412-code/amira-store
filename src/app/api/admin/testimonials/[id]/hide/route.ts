/**
 * Amira Store — WhatsApp testimonial hide endpoint (PHASE-09).
 *
 * POST /api/admin/testimonials/[id]/hide — withdraws a published testimonial
 * from ALL store surfaces (homepage + PDP). Only published items can hide;
 * drafts were never rendered. The media object itself is untouched (it was
 * privacy-reviewed at publish time); hide is a DISPLAY withdrawal recorded
 * with a sanitized audit row.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse, guardJsonMutation } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { hideTestimonial } from '@/lib/admin/testimonials';

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

    const result = await hideTestimonial({
      testimonialId: id,
      adminUserId: session.admin.id,
    });
    return NextResponse.json({ ok: true as const, status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}
