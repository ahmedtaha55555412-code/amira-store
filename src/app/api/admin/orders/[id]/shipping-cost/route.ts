/**
 * Amira Store — admin shipping cost API (PHASE-08).
 * POST /api/admin/orders/[id]/shipping-cost → enter the WhatsApp-confirmed
 * shipping fee; the grand total is recalculated SERVER-SIDE (MASTER_PLAN §11)
 * and the DB CHECK `orders_grand_total_identity` re-validates the identity.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse, guardJsonMutation, jsonOk, readJson } from '@/lib/api/admin';
import { setShippingCost } from '@/lib/admin/orders';
import { requireAdminMutation } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  shippingCost: z.number(),
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
    const result = await setShippingCost(id, body.shippingCost, session.admin.id);
    return jsonOk({
      ok: true,
      orderNumber: result.orderNumber,
      shippingCost: result.shippingCost,
      grandTotal: result.grandTotal,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
