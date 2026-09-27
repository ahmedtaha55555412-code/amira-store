/**
 * Amira Store — admin media asset detail API (PHASE-04 task 11).
 * PUT    /api/admin/media/[id] → alt-text update.
 * DELETE /api/admin/media/[id] → guarded delete: refused while ANY domain
 *          references the asset (product images / reviews / testimonials /
 *          banners); weak references (brand settings, category images) are
 *          reported and cleared by SET NULL — never orphaning rows.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse, guardJsonMutation, guardMutation, jsonOk, readJson } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { deleteMediaAsset, getMediaReferenceReport } from '@/lib/media/registry';
import { updateMediaAltText } from '@/lib/media/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const putSchema = z.object({
  altText: z.string().max(300).nullish(),
});

function isUuid(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = guardJsonMutation(request);
  if (guard) return guard;

  try {
    await requireAdminMutation();
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'معرّف غير صالح.' }, { status: 400 });
    }
    const body = putSchema.parse(await readJson(request));
    const updated = await updateMediaAltText(id, body.altText?.trim() || null);
    if (!updated) {
      return NextResponse.json({ error: 'الوسيط غير موجود.' }, { status: 404 });
    }
    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = guardMutation(request);
  if (guard) return guard;

  try {
    await requireAdminMutation();
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'معرّف غير صالح.' }, { status: 400 });
    }
    const report = await deleteMediaAsset(id);
    if (!report.deletable) {
      return NextResponse.json(
        {
          error: `لا يمكن حذف هذا الوسيط — مستخدم حاليًا في: ${report.blockers.join('، ')}.`,
        },
        { status: 409 },
      );
    }
    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET is a read-only reference report for the admin UI delete confirmation. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdminMutation();
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'معرّف غير صالح.' }, { status: 400 });
    }
    const report = await getMediaReferenceReport(id);
    return NextResponse.json(report);
  } catch (error) {
    return errorResponse(error);
  }
}
