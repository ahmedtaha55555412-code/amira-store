/**
 * Amira Store — admin homepage sections API (PHASE-10).
 *
 * GET  /api/admin/homepage/sections → every managed section (vocabulary order).
 * PATCH /api/admin/homepage/sections → reorder ALL sections atomically
 *        (body: {order: [sectionId, …]}; complete list required).
 *
 * Admin-only; same-origin; no-store. NO product-selection fields exist
 * anywhere in this contract (hard exclusion, MASTER_PLAN §4).
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  errorResponse,
  guardJsonMutation,
  jsonOk,
} from '@/lib/api/admin';
import { requireAdminMutation, requireAdminPage } from '@/lib/auth/guard';
import {
  getAdminHomepageSections,
  reorderHomepageSections,
  sectionOrderSchema,
} from '@/lib/admin/homepage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminPage();

    const sections = await getAdminHomepageSections();
    return jsonOk({
      sections: sections.map((s) => ({
        id: s.id,
        sectionKey: s.sectionKey,
        title: s.title,
        subtitle: s.subtitle,
        isEnabled: s.isEnabled,
        sortOrder: s.sortOrder,
        config: s.config,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const guard = guardJsonMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();

    const body = await request.json().catch(() => null);
    const { order } = sectionOrderSchema.parse(body ?? {});

    await reorderHomepageSections(order, session.admin.id);

    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}
