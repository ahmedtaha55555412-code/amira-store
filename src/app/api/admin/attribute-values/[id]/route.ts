/**
 * Amira Store — admin attribute-value detail API (PHASE-04 task 3).
 * DELETE /api/admin/attribute-values/[id] → guarded delete (refused when any
 * variant carries this value — variant definitions must never be stripped).
 */

import {
  NextResponse,
  type NextRequest } from 'next/server';
import { errorResponse,
  guardJsonMutation,
  jsonOk,
  jsonNoStore
} from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { deleteAttributeValue } from '@/lib/catalog/attributes';

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
      return jsonNoStore({ error: 'معرّف غير صالح.' }, { status: 400 });
    }
    await deleteAttributeValue(id, session.admin.id);
    return jsonOk();
  } catch (error) {
    return errorResponse(error);
  }
}
