/**
 * Amira Store — admin homepage section detail API (PHASE-10).
 *
 * PATCH /api/admin/homepage/sections/[id] → update title/subtitle/visibility
 * and the per-key JSONB config (validated against the code-limited config
 * schemas). Query-driven sections keep their data sources regardless of what
 * is edited here — no product-selection logic exists (hard exclusion).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { errorResponse, guardJsonMutation, jsonOk } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { sectionUpdateSchema, updateHomepageSection } from '@/lib/admin/homepage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = guardJsonMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();
    const { id } = await params;

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'معرّف غير صالح.' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const input = sectionUpdateSchema.parse(body ?? {});

    const updated = await updateHomepageSection(id, input, session.admin.id);

    return jsonOk({
      section: {
        id: updated.id,
        sectionKey: updated.sectionKey,
        title: updated.title,
        subtitle: updated.subtitle,
        isEnabled: updated.isEnabled,
        sortOrder: updated.sortOrder,
        config: updated.config,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
