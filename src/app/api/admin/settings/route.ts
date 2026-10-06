/**
 * Amira Store — admin store-settings API (PHASE-10).
 *
 * GET   /api/admin/settings  → the singleton row + resolved branding data.
 * PATCH /api/admin/settings  → validated field update (zod, Arabic errors).
 *
 * Admin-only: same-origin → session → zod → service. no-store everywhere.
 */

import {
  NextResponse,
  type NextRequest } from 'next/server';

import {
  errorResponse,
  guardJsonMutation,
  jsonOk,
  jsonNoStore
} from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import {
  getStoreSettings,
  settingsUpdateSchema,
  updateStoreSettings,
} from '@/lib/admin/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminMutation();

    const row = await getStoreSettings();
    if (!row) {
      return jsonNoStore(
        { error: 'إعدادات المتجر غير مهيأة.' },
        { status: 503 },
      );
    }

    return jsonOk({
      settings: {
        storeName: row.storeName,
        whatsappPhone: row.whatsappPhone,
        whatsappMessageTemplate: row.whatsappMessageTemplate,
        supportPhone: row.supportPhone,
        footerText: row.footerText,
        socialLinks: row.socialLinks ?? null,
        logoMediaId: row.logoMediaId,
        faviconMediaId: row.faviconMediaId,
        updatedAt: row.updatedAt,
      },
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
    const input = settingsUpdateSchema.parse(body ?? {});

    const updated = await updateStoreSettings(input, session.admin.id);

    return jsonOk({
      settings: {
        storeName: updated.storeName,
        whatsappPhone: updated.whatsappPhone,
        whatsappMessageTemplate: updated.whatsappMessageTemplate,
        supportPhone: updated.supportPhone,
        footerText: updated.footerText,
        socialLinks: updated.socialLinks ?? null,
        logoMediaId: updated.logoMediaId,
        faviconMediaId: updated.faviconMediaId,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
