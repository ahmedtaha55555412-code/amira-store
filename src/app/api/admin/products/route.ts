/**
 * Amira Store — admin products API (PHASE-04 task 2).
 * POST /api/admin/products → create a draft product (basics only; the full
 * aggregate — variants/images/size guide — is saved via the editor PUT).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse, guardJsonMutation, jsonOk, readJson } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { createProduct } from '@/lib/catalog/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().max(120).nullish(),
  categoryId: z.string().uuid(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = guardJsonMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();
    const body = bodySchema.parse(await readJson(request));
    const product = await createProduct(body, session.admin.id);
    return jsonOk({ ok: true, product: { id: product.id, slug: product.slug } });
  } catch (error) {
    return errorResponse(error);
  }
}
