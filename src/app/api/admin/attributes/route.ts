/**
 * Amira Store — admin attributes API (PHASE-04 task 3).
 * POST /api/admin/attributes → create a generic attribute definition.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse, guardJsonMutation, jsonOk, readJson } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { createAttribute } from '@/lib/catalog/attributes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  name: z.string().min(2).max(60),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = guardJsonMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();
    const body = bodySchema.parse(await readJson(request));
    const attribute = await createAttribute(body, session.admin.id);
    return jsonOk({ ok: true, attribute: { id: attribute.id, slug: attribute.slug } });
  } catch (error) {
    return errorResponse(error);
  }
}
