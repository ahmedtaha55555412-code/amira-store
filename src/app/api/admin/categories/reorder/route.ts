/**
 * Amira Store — admin categories bulk reorder (PHASE-04 task 1).
 * POST /api/admin/categories/reorder → persist the visible order.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse, guardJsonMutation, jsonOk, readJson } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { reorderCategories } from '@/lib/catalog/categories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = guardJsonMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();
    const body = bodySchema.parse(await readJson(request));
    await reorderCategories(body.orderedIds, session.admin.id);
    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}
