/**
 * Amira Store — admin media content route (PHASE-09).
 *
 * GET /api/admin/media/[id]/content — authenticated preview stream for
 * PRIVATE media (pending review images, draft testimonial screenshots).
 * This is the ONLY path through which a private object's bytes are readable,
 * and it is admin-session-gated end to end:
 * - requireAdminMutation() re-validates the session against the database;
 * - public assets are NOT streamed here (302 → CDN URL; no double-serving);
 * - responses are no-store; the URL of a private object is never included in
 *   any response body.
 *
 * This GET is deliberate (the "no admin GET" convention covers mutation-side
 * discovery probes): a media preview is a read-only byte fetch, needs no
 * body parsing, and changes no state.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { mediaAssets } from '@/db/schema';
import { errorResponse } from '@/lib/api/admin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { readPrivateMedia } from '@/lib/media/service';
import { MediaStorageUnavailableError } from '@/lib/media/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdminMutation();
    const { id } = await params;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'معرّف غير صالح.' }, { status: 400 });
    }

    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, id))
      .limit(1);
    if (!asset) {
      return NextResponse.json({ error: 'الوسائط غير موجودة.' }, { status: 404 });
    }

    if (asset.accessMode === 'public') {
      // Public objects are served by the CDN directly — never proxied here.
      // Registry URLs may be provider-absolute (Blob) or seed-relative
      // (local demo placeholders) — resolve BOTH against the request origin
      // (NextResponse.redirect throws on non-absolute targets).
      const origin = new URL(_request.url).origin;
      const target = new URL(asset.url, origin);
      return NextResponse.redirect(target, { status: 302 });
    }

    const content = await readPrivateMedia(asset);
    if (!content) {
      return NextResponse.json({ error: 'الوسائط غير موجودة.' }, { status: 404 });
    }

    return new NextResponse(content.stream, {
      status: 200,
      headers: {
        'Content-Type': content.contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof MediaStorageUnavailableError) {
      return errorResponse(error);
    }
    return errorResponse(error);
  }
}
