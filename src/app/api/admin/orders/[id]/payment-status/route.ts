/**
 * Amira Store — admin order payment status API (PHASE-08).
 * POST /api/admin/orders/[id]/payment-status → COD collection tracking.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse, guardJsonMutation, jsonOk, readJson } from '@/lib/api/admin';
import { setPaymentStatus } from '@/lib/admin/orders';
import { requireAdminMutation } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  status: z.enum(['pending', 'collected', 'failed']),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = guardJsonMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'معرّف غير صالح.' }, { status: 400 });
    }
    const body = bodySchema.parse(await readJson(request));
    const result = await setPaymentStatus(id, body.status, session.admin.id);
    return jsonOk({ ok: true, orderNumber: result.orderNumber, from: result.from, to: result.to });
  } catch (error) {
    return errorResponse(error);
  }
}
