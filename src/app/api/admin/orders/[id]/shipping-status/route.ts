/**
 * Amira Store — admin shipping status API (PHASE-08).
 * POST /api/admin/orders/[id]/shipping-status → validated shipping transition.
 * returned_to_stock restores stock exactly once and cancels a standing order
 * (explicit audited coupling — items physically back ⇒ the sale cannot stand).
 */

import {
  NextResponse,
  type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse,
  guardJsonMutation,
  jsonOk,
  readJson,
  jsonNoStore
} from '@/lib/api/admin';
import { transitionShippingStatus } from '@/lib/admin/orders';
import { requireAdminMutation } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  status: z.enum([
    'not_started',
    'preparing',
    'ready_to_ship',
    'shipped',
    'out_for_delivery',
    'delivered',
    'delivery_failed',
    'returned_to_stock',
  ]),
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
      return jsonNoStore({ error: 'معرّف غير صالح.' }, { status: 400 });
    }
    const body = bodySchema.parse(await readJson(request));
    const result = await transitionShippingStatus(id, body.status, session.admin.id);
    return jsonOk({
      ok: true,
      orderNumber: result.orderNumber,
      from: result.from,
      to: result.to,
      restoredVariants: result.restored.length,
      coupledCancellation: result.coupledCancellation,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
