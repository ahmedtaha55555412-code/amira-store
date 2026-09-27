/**
 * Amira Store — admin categories API (PHASE-04 task 1).
 * POST /api/admin/categories → create a category.
 * Same-origin + JSON gates run before authorization and parsing.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdminMutation } from '@/lib/auth/guard';
import { createCategory } from '@/lib/catalog/categories';
import { errorResponse, guardJsonMutation, jsonOk, readJson } from '@/lib/api/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().max(120).nullish(),
  parentId: z.string().uuid().nullish(),
  description: z.string().max(1000).nullish(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = guardJsonMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();
    const body = bodySchema.parse(await readJson(request));
    const category = await createCategory(body, session.admin.id);
    return jsonOk({ ok: true, category: { id: category.id, slug: category.slug } });
  } catch (error) {
    return errorResponse(error);
  }
}
