/**
 * Amira Store — review moderation endpoint (PHASE-09).
 *
 * POST /api/admin/reviews/[id]/moderate { action: 'approved' | 'rejected' }
 * Approving materializes the review's image PUBLIC before the status flip
 * commits; rejecting leaves the private image unrendered. One sanitized audit
 * row is atomic with each status change. Same discipline as every admin
 * mutation: same-origin → JSON → session → zod → service → shared mapper.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse, guardJsonMutation, readJson } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { moderateReview } from '@/lib/admin/reviews';

export const dynamic = 'force-dynamic';

const moderateSchema = z.object({
  action: z.enum(['approved', 'rejected']),
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
      return NextResponse.json({ error: 'معرّف المراجعة غير صالح.' }, { status: 400 });
    }

    const body = await readJson(_request);
    const parsed = moderateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'إجراء المراجعة غير صالح.' },
        { status: 400 },
      );
    }

    const result = await moderateReview({
      reviewId: id,
      action: parsed.data.action,
      adminUserId: session.admin.id,
    });
    return NextResponse.json({ ok: true as const, status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}
