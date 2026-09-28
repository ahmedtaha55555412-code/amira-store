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

import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
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
 * PHASE-09 access contract (MASTER_PLAN §20): `accessMode: 'private'` marks
 * media that is NOT publicly exposed until its owning domain publishes it
 * (pending review images, draft WhatsApp testimonial screenshots). Private
 * objects are readable server-side ONLY via admin-authenticated routes.
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
    await provider.delete(pathname).catch(() => undefined);
    throw error;
  }

  return asset;
}

/* -------------------------------------------------------------------------- */
/* PHASE-09: private → public disclosure flip (moderation publishes media)     */
/* -------------------------------------------------------------------------- */

/**
 * Flip a private asset's REGISTRY access_mode to public — the application's
 * deliberate disclosure decision at moderation/publish time (ISSUE-048:
 * storage-level per-object privacy is unavailable on the public-mode Blob
 * store, so the gate lives here). Idempotent; no provider operation is
 * needed (and none could add privacy retroactively).
 */
export async function materializeMediaPublic(asset: MediaAsset): Promise<MediaAsset> {
  if (asset.accessMode === 'public') return asset;

  const [updated] = await db
    .update(mediaAssets)
    .set({ accessMode: 'public' })
    .where(eq(mediaAssets.id, asset.id))
    .returning();
  if (!updated) throw new Error('media asset row disappeared during disclosure flip');
  return updated;
}

/**
 * Server-side read stream for a PRIVATE asset (admin-authenticated preview
 * routes only). Public assets are NOT served through here — callers redirect
 * to the CDN URL. Returns null when the object no longer exists.
 */
export async function readPrivateMedia(
  asset: MediaAsset,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  if (asset.accessMode !== 'private') return null;
  const provider = getMediaStorageProvider();
  if (!provider?.getPrivate) throw new MediaStorageUnavailableError();
  return provider.getPrivate(asset.pathname);
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
