/**
 * Amira Store — media service facade (PHASE-04 tasks 9 & 10).
 *
 * The ONLY entry point the application uses for storage-backed media:
 * validate → provider.put → register in media_assets. The provider is
 * resolved here (initially Vercel Blob per MASTER_PLAN §20) and never
 * imported elsewhere.
 *
 * Upload authorization is the API route's responsibility (requireAdminMutation);
 * everything about the FILE itself is this module's responsibility.
 */

import { randomUUID } from 'node:crypto';

import { eq, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { db, type AmiraDatabase } from '@/db/client';
import { mediaAssets, type MediaAsset } from '@/db/schema';

import {
  ImageValidationError,
  validateImageUpload,
} from './validation';
import {
  MediaStorageUnavailableError,
  type MediaStorageProvider,
} from './types';
import {
  isPrivateStorePathname,
  isVercelBlobConfigured,
  vercelBlobProvider,
} from './vercel-blob';

/**
 * Resolve the active provider, or null when uploads are not configured.
 * A null provider is an HONEST configuration state, not an error path:
 * the admin UI surfaces exactly what is missing and how to fix it.
 */
export function getMediaStorageProvider(): MediaStorageProvider | null {
  if (isVercelBlobConfigured()) return vercelBlobProvider;
  return null;
}

/** Whether the upload flow is usable in the current environment. */
export function isMediaUploadConfigured(): boolean {
  return getMediaStorageProvider() !== null;
}

/** Date-based folder keeps the provider namespace tidy and listing cheap. */
function buildPathname(contentType: string, folder: string): string {
  const ext =
    contentType === 'image/jpeg'
      ? 'jpg'
      : contentType === 'image/png'
        ? 'png'
        : contentType === 'image/webp'
          ? 'webp'
          : 'avif';
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${folder}/${ym}/${randomUUID()}-${Date.now()}.${ext}`;
}

export type UploadImageResult = MediaAsset;

/**
 * Validate + persist + register one image upload.
 * Throws ImageValidationError (422) or MediaStorageUnavailableError (503).
 *
 * PHASE-09 access contract (MASTER_PLAN §20, ISSUE-048 final model):
 * `accessMode: 'private'` uploads land in the REAL PRIVATE Blob store —
 * storage-level privacy (unauthenticated CDN reads rejected) — while
 * `accessMode: 'public'` uploads land in the public store exactly as before.
 * Private originals become publicly deliverable ONLY through the app's
 * controlled delivery route (/api/media/[id]) after the owning domain's
 * deliberate disclosure (moderation approval / privacy-confirmed publish).
 */
export async function uploadImage(input: {
  bytes: Buffer;
  declaredContentType: string | null;
  altText: string | null;
  adminUserId: string | null;
  accessMode?: 'public' | 'private';
  folder?: string;
}): Promise<UploadImageResult> {
  const provider = getMediaStorageProvider();
  if (!provider) throw new MediaStorageUnavailableError();

  const accessMode = input.accessMode ?? 'public';
  const folder = input.folder ?? 'uploads';
  const validated = await validateImageUpload(input);

  const pathname = buildPathname(validated.contentType, folder);
  const stored = await provider.put({
    pathname,
    body: validated.bytes,
    contentType: validated.contentType,
    accessMode,
  });

  // Orphan prevention (pre-PHASE-08 hardening, ISSUE-023): if the registry
  // insert fails AFTER the bytes reached the provider, best-effort delete the
  // stored object so no unreachable blob outlives its database reference.
  let asset: MediaAsset;
  try {
    [asset] = await db
      .insert(mediaAssets)
      .values({
        provider: provider.id,
        pathname: stored.pathname,
        url: stored.url,
        accessMode,
        mimeType: validated.contentType,
        sizeBytes: stored.sizeBytes,
        width: validated.width,
        height: validated.height,
        altText: input.altText,
        metadata: {
          validatedBy: 'magic-bytes+sharp',
        },
        createdByAdminId: input.adminUserId,
      })
      .returning();
  } catch (error) {
    try {
      await provider.delete(stored.pathname);
    } catch (cleanupError) {
      console.error(
        '[media/upload] provider compensation failed',
        cleanupError instanceof Error ? cleanupError.name : 'UnknownError',
      );
    }
    throw error;
  }

  return asset;
}

/* -------------------------------------------------------------------------- */
/* PHASE-09: private → public disclosure flip (moderation publishes media)     */
/* -------------------------------------------------------------------------- */

/**
 * Flip a private asset's REGISTRY access_mode to public — the application's
 * deliberate disclosure decision at moderation/publish time (ISSUE-048
 * final model). The object itself NEVER moves between stores: a private-store
 * original stays in the private store forever; the flip merely opens the
 * app's controlled delivery route (/api/media/[id]) for the owning entity.
 * Idempotent; no provider operation is needed.
 */
type MediaWriter = Pick<AmiraDatabase, 'update'>;

export async function materializeMediaPublic(
  asset: MediaAsset,
  writer: MediaWriter = db,
): Promise<MediaAsset> {
  if (asset.accessMode === 'public') return asset;

  const [updated] = await writer
    .update(mediaAssets)
    .set({ accessMode: 'public' })
    .where(eq(mediaAssets.id, asset.id))
    .returning();
  if (!updated) throw new Error('media asset row disappeared during disclosure flip');
  return updated;
}

/**
 * Server-side read stream for a PRIVATE-STORE asset (authenticated app
 * routes only: admin preview + controlled public delivery). Routing is by
 * the pathname NAMESPACE (storage truth), not the registry access_mode —
 * a private-store object must stream even after its registry access_mode
 * was flipped public at disclosure, because its provider URL is never
 * publicly readable. Public-store assets are NOT served through here —
 * callers redirect to the CDN URL. Returns null when the object no longer
 * exists.
 */
export async function readPrivateMedia(
  asset: MediaAsset,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  if (!isPrivateStorePathname(asset.pathname)) return null;
  const provider = getMediaStorageProvider();
  if (!provider?.getPrivate) throw new MediaStorageUnavailableError();
  return provider.getPrivate(asset.pathname);
}

/**
 * Canonical PUBLIC delivery URL for an approved asset row (TS side).
 * Private-store originals are delivered through the controlled app route;
 * public-store assets keep their CDN URL. The SQL twin below is used inside
 * feed queries — keep both in sync (single source: this module).
 */
export function publicDeliveryUrl(asset: Pick<MediaAsset, 'id' | 'pathname' | 'url'>): string {
  return isPrivateStorePathname(asset.pathname) ? `/api/media/${asset.id}` : asset.url;
}

/**
 * SQL expression twin of {@link publicDeliveryUrl} for feed queries that
 * must map the delivery URL INSIDE the database round-trip (subqueries over
 * review_images / media_assets). One definition — imported by every feed.
 */
export function publicDeliveryUrlSql(
  assetId: SQL | AnyPgColumn,
  pathname: SQL | AnyPgColumn,
  url: SQL | AnyPgColumn,
): SQL<string> {
  return sql<string>`case
    when ${pathname} like 'reviews/%' or ${pathname} like 'testimonials/%'
      then '/api/media/' || ${assetId}::text
    else ${url}
  end`;
}

export { ImageValidationError, MediaStorageUnavailableError };

/** Update admin-editable asset metadata (alt text only — URL/type are facts). */
export async function updateMediaAltText(
  assetId: string,
  altText: string | null,
): Promise<MediaAsset | null> {
  const [row] = await db
    .update(mediaAssets)
    .set({ altText })
    .where(eq(mediaAssets.id, assetId))
    .returning();
  return row ?? null;
}
