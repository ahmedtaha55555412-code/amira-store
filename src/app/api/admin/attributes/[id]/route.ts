/**
 * Amira Store — admin attribute detail API (PHASE-04 task 3).
 * DELETE /api/admin/attributes/[id] → guarded delete (refused when any
 * variant references one of the attribute's values).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, guardJsonMutation, jsonOk } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { deleteAttribute } from '@/lib/catalog/attributes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
      return NextResponse.json({ error: 'معرّف غير صالح.' }, { status: 400 });
    }
    await deleteAttribute(id, session.admin.id);
    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}
