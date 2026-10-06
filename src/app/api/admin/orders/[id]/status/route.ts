/**
 * Amira Store — admin order status API (PHASE-08).
 * POST /api/admin/orders/[id]/status → validated order-status transition.
 * Cancellation restores stock exactly once (service-enforced + DB-indexed).
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
import { transitionOrderStatus } from '@/lib/admin/orders';
import { requireAdminMutation } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  status: z.enum(['new', 'under_review', 'confirmed', 'preparing', 'completed', 'canceled']),
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
    const result = await transitionOrderStatus(id, body.status, session.admin.id);
    return jsonOk({
      ok: true,
      orderNumber: result.orderNumber,
      from: result.from,
      to: result.to,
      restoredVariants: result.restored.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
