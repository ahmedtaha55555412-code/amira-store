/**
 * Amira Store — admin category detail API (PHASE-04 task 1).
 * PUT    /api/admin/categories/[id] → update (reparent/slug/order/activation).
 * DELETE /api/admin/categories/[id] → guarded delete (no children/products).
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
import { requireAdminMutation } from '@/lib/auth/guard';
import { deleteCategory, updateCategory } from '@/lib/catalog/categories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const putSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().max(120).nullish(),
  parentId: z.string().uuid().nullish(),
  description: z.string().max(1000).nullish(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
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
    const body = putSchema.parse(await readJson(request));
    const category = await updateCategory(id, body, session.admin.id);
    return jsonOk({ ok: true, category: { id: category.id, slug: category.slug } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
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
    await deleteCategory(id, session.admin.id);
    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}
