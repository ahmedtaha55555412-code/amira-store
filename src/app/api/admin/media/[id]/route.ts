/**
 * Amira Store — admin media asset detail API (PHASE-04 task 11).
 * PUT    /api/admin/media/[id] → alt-text update.
 * DELETE /api/admin/media/[id] → guarded delete: refused while ANY domain
 *          references the asset (product images / reviews / testimonials /
 *          banners); weak references (brand settings, category images) are
 *          reported and cleared by SET NULL — never orphaning rows.
 */

import {
  NextResponse,
  type NextRequest } from 'next/server';
import { z } from 'zod';

import { errorResponse,
  guardJsonMutation,
  guardMutation,
  jsonOk,
  readJson,
  jsonNoStore
} from '@/lib/api/admin';
import { recordAdminActivity } from '@/lib/auth/activity';
import { requireAdminMutation } from '@/lib/auth/guard';
import { db } from '@/db/client';
import { mediaAssets } from '@/db/schema';
import { eq } from 'drizzle-orm';
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
    const session = await requireAdminMutation();
    const { id } = await context.params;
    if (!isUuid(id)) {
      return jsonNoStore({ error: 'معرّف غير صالح.' }, { status: 400 });
    }
    const body = putSchema.parse(await readJson(request));
    const updated = await updateMediaAltText(id, body.altText?.trim() || null);
    if (!updated) {
      return jsonNoStore({ error: 'الوسيط غير موجود.' }, { status: 404 });
    }
    // PHASE-12: media operations are audited like every other admin mutation.
    await recordAdminActivity({
      adminUserId: session.admin.id,
      action: 'media.alt_updated',
      entityType: 'media_asset',
      entityId: id,
      metadata: { hasAltText: Boolean(updated.altText) },
    });
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
    const session = await requireAdminMutation();
    const { id } = await context.params;
    if (!isUuid(id)) {
      return jsonNoStore({ error: 'معرّف غير صالح.' }, { status: 400 });
    }
    // Capture the deleted row's identity BEFORE the delete (the registry row
    // is gone afterwards) for honest audit metadata.
    const [deletedAsset] = await db
      .select({ pathname: mediaAssets.pathname, accessMode: mediaAssets.accessMode })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, id))
      .limit(1);
    const report = await deleteMediaAsset(id);
    if (!report.deletable) {
      return jsonNoStore(
        {
          error: `لا يمكن حذف هذا الوسيط — مستخدم حاليًا في: ${report.blockers.join('، ')}.`,
        },
        { status: 409 },
      );
    }
    // PHASE-12: media operations are audited like every other admin mutation.
    await recordAdminActivity({
      adminUserId: session.admin.id,
      action: 'media.deleted',
      entityType: 'media_asset',
      entityId: id,
      metadata: {
        pathname: deletedAsset?.pathname ?? null,
        accessMode: deletedAsset?.accessMode ?? null,
        weakReferences: report.weakReferences,
      },
    });
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
      return jsonNoStore({ error: 'معرّف غير صالح.' }, { status: 400 });
    }
    const report = await getMediaReferenceReport(id);
    return jsonNoStore(report);
  } catch (error) {
    return errorResponse(error);
  }
}
