/**
 * Amira Store — admin order items edit API (PHASE-08).
 * POST /api/admin/orders/[id]/items → atomic full-line-set edit.
 * Inventory deltas are computed against the prior order state inside ONE
 * transaction: increases re-validate live activity + stock under row locks
 * (no negative stock), decreases/removals return stock, every change lands in
 * the ledger, existing lines keep their committed unit price, and new lines
 * are priced from LIVE database values.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { errorResponse, guardJsonMutation, jsonOk, readJson } from '@/lib/api/admin';
import { orderEditSchema, updateOrderItems } from '@/lib/admin/orders';
import { requireAdminMutation } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const parsed = orderEditSchema.parse(await readJson(request));
    const result = await updateOrderItems(id, parsed, session.admin.id);
    return jsonOk({
      ok: true,
      orderNumber: result.orderNumber,
      productsTotal: result.productsTotal,
      grandTotal: result.grandTotal,
      addedLines: result.addedLines,
      removedLines: result.removedLines,
      increased: result.increased.length,
      decreased: result.decreased.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
