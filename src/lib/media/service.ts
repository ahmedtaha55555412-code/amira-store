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
import { MediaStorageUnavailableError, type MediaStorageProvider } from './types';
import { isVercelBlobConfigured, vercelBlobProvider } from './vercel-blob';

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
function buildPathname(contentType: string): string {
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
  return `uploads/${ym}/${randomUUID()}-${Date.now()}.${ext}`;
}

export type UploadImageResult = MediaAsset;

/**
 * Validate + persist + register one image upload.
 * Throws ImageValidationError (422) or MediaStorageUnavailableError (503).
 */
export async function uploadImage(input: {
  bytes: Buffer;
  declaredContentType: string | null;
  altText: string | null;
  adminUserId: string;
}): Promise<UploadImageResult> {
  const provider = getMediaStorageProvider();
  if (!provider) throw new MediaStorageUnavailableError();

  const validated = await validateImageUpload(input);

  const pathname = buildPathname(validated.contentType);
  const stored = await provider.put({
    pathname,
    body: validated.bytes,
    contentType: validated.contentType,
    accessMode: 'public',
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
        accessMode: 'public',
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
