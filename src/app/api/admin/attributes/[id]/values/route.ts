/**
 * Amira Store — admin attribute values API (PHASE-04 task 3).
 * POST /api/admin/attributes/[id]/values → add a value to an attribute.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse, guardJsonMutation, jsonOk, readJson } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { createAttributeValue } from '@/lib/catalog/attributes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  value: z.string().min(1).max(80),
  sortOrder: z.number().int().min(0).max(9999).optional(),
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
    const value = await createAttributeValue(id, body, session.admin.id);
    return jsonOk({ ok: true, value: { id: value.id, value: value.value } });
  } catch (error) {
    return errorResponse(error);
  }
}
