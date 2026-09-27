/**
 * Amira Store — admin product status API (PHASE-04 task 2).
 * POST /api/admin/products/[id]/status → draft/active/archived transition.
 * Products are archived, NEVER hard-deleted (order history stays referential).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse, guardJsonMutation, jsonOk, readJson } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { setProductStatus } from '@/lib/catalog/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  status: z.enum(['draft', 'active', 'archived']),
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
    await setProductStatus(id, body.status, session.admin.id);
    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}
