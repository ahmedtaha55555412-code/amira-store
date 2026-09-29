/**
 * Amira Store — admin homepage banner detail API (PHASE-10).
 *
 * PATCH  /api/admin/homepage/banners/[id] → edit copy/CTA/visibility/window.
 * DELETE /api/admin/homepage/banners/[id] → remove the banner (the media
 *        asset stays in the registry; its guarded delete handles removal).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { errorResponse, guardJsonMutation, guardMutation, jsonOk } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { bannerUpdateSchema, deleteHomepageBanner, updateHomepageBanner } from '@/lib/admin/homepage';

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
    const input = bannerUpdateSchema.parse(body ?? {});

    await updateHomepageBanner(id, input, session.admin.id);

    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Same-origin gate (PHASE-12 hardening parity with every other admin
  // mutation route — DELETE previously lacked the CSRF defense).
  const guard = guardMutation(request);
  if (guard) return guard;

  try {
    const session = await requireAdminMutation();
    const { id } = await params;

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'معرّف غير صالح.' }, { status: 400 });
    }

    await deleteHomepageBanner(id, session.admin.id);

    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}
