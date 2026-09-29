/**
 * Amira Store — admin inventory manual stock adjustment API (PHASE-12).
 * POST /api/admin/inventory/adjust → one signed stock delta with a MANDATORY
 * reason. Pipeline: same-origin+JSON gate → session authorization → zod →
 * transactional service (row lock, no-negative check, ledger row, atomic
 * audit) → shared error mapping. See src/lib/admin/inventory.ts.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { errorResponse, guardJsonMutation, jsonOk, readJson } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { adjustVariantStock, stockAdjustmentSchema } from '@/lib/admin/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  const guard = guardJsonMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();
    const body = await readJson(request);
    const input = stockAdjustmentSchema.parse(body);
    const result = await adjustVariantStock(input, session.admin.id);
    return jsonOk({
      ok: true,
      sku: result.sku,
      stockBefore: result.stockBefore,
      stockAfter: result.stockAfter,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
