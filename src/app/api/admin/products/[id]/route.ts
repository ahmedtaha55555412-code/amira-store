/**
 * Amira Store — admin product aggregate API (PHASE-04 tasks 4–8, 11–14).
 *
 * PUT /api/admin/products/[id] → transactional full-aggregate save. The
 * editor submits the complete desired state; the SERVICE validates
 * everything server-side (pricing never trusted from the client, one value
 * per attribute per variant, explicit-combination uniqueness, stock ledger
 * deltas, media-reference integrity).
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
import { saveProductAggregate } from '@/lib/catalog/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const levelSchema = z.union([
  z.literal('product'),
  z.object({ variantKey: z.string().min(1).max(80) }),
]);

const bodySchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().max(120).nullish(),
  categoryId: z.string().uuid(),
  shortDescription: z.string().max(1000).nullish(),
  description: z.string().max(20000).nullish(),
  metaTitle: z.string().max(200).nullish(),
  metaDescription: z.string().max(500).nullish(),
  canonicalSlug: z.string().max(120).nullish(),
  attributeIds: z.array(z.string().uuid()).max(10),
  variants: z
    .array(
      z.object({
        clientKey: z.string().min(1).max(80),
        id: z.string().uuid().nullish(),
        sku: z.string().min(1).max(80),
        originalPrice: z.union([z.string(), z.number()]),
        currentPrice: z.union([z.string(), z.number()]),
        stockQuantity: z.number().int(),
        lowStockThreshold: z.number().int(),
        isActive: z.boolean(),
        attributeValueIds: z.array(z.string().uuid()).max(10),
      }),
    )
    .min(1)
    .max(100),
  images: z
    .array(
      z.object({
        mediaAssetId: z.string().uuid(),
        level: levelSchema,
        altText: z.string().max(300).nullish(),
        isPrimary: z.boolean(),
        sortOrder: z.number().int().min(0).max(9999),
      }),
    )
    .max(30),
  sizeGuide: z
    .object({
      title: z.string().max(200).nullish(),
      notes: z.string().max(2000).nullish(),
      rows: z
        .array(
          z.object({
            sizeLabel: z.string().min(1).max(40),
            measurements: z.record(z.string(), z.string().max(40)),
            sortOrder: z.number().int().min(0).max(9999),
          }),
        )
        .max(50),
    })
    .nullish(),
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
    const body = bodySchema.parse(await readJson(request));
    const product = await saveProductAggregate(id, body, session.admin.id);
    return jsonOk({ ok: true, product: { id: product.id, slug: product.slug } });
  } catch (error) {
    return errorResponse(error);
  }
}
