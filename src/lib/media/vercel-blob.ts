/**
 * Amira Store — Vercel Blob storage provider (PHASE-04 task 9).
 *
 * Thin adapter over @vercel/blob. Configuration is checked lazily: when no
 * Blob credentials are present the service layer surfaces an honest
 * "not configured" state instead of failing mid-upload (see service.ts).
 *
 * Authentication (current Vercel model, verified 2026-09-27):
 * - OIDC (default for newly connected stores): Vercel injects
 *   BLOB_STORE_ID + VERCEL_OIDC_TOKEN into the connected project; the SDK
 *   pairs them per request with a short-lived auto-rotating token. Only
 *   available inside the Vercel runtime (VERCEL_OIDC_TOKEN is minted there).
 * - Legacy long-lived BLOB_READ_WRITE_TOKEN for stores not yet upgraded.
 * @vercel/blob ≥2.4 resolves auth itself (OIDC first, token fallback); this
 * adapter only decides whether ANY supported credential surface exists.
 *
 * NOTE — access-mode model (ISSUE-2026-09-28-048, PHASE-09): the connected
 * store is PUBLIC-mode, and Vercel Blob refuses `put(access: 'private')` on
 * a public store ("Cannot use private access on a public store"). Per-object
 * storage-level privacy is therefore NOT available on this store. The
 * privacy contract is enforced at the APPLICATION layer instead:
 *   - every object is stored with blob access 'public' at an unguessable
 *     capability pathname (uuid + timestamp);
 *   - media_assets.access_mode ('private') is the app-level gate: private
 *     assets are NEVER rendered on a public surface, NEVER returned by a
 *     public API, and previewable ONLY through the admin-authenticated
 *     content route (server-side get(access:'private'), verified to work
 *     for public-stored blobs);
 *   - approval/publication flips the REGISTRY access_mode — the application's
 *     deliberate disclosure decision.
 * Residual (documented, accepted): a private asset's underlying object is
 * CDN-readable via its URL by anyone who LEARNS the URL from outside the
 * application. Storage-level privacy requires a private-mode store — owner
 * infrastructure decision, hardening candidate (PHASE-14).
 */

import { del, get, put } from '@vercel/blob';

import type {
  MediaStorageProvider,
  PutObjectInput,
  PutObjectResult,
} from './types';

function hasEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

export function isVercelBlobConfigured(): boolean {
  // Same surfaces @vercel/blob's resolveBlobAuth() accepts: a long-lived
  // read-write token, or the OIDC pair (store id + runtime OIDC token).
  return hasEnv('BLOB_READ_WRITE_TOKEN') || (hasEnv('BLOB_STORE_ID') && hasEnv('VERCEL_OIDC_TOKEN'));
}

export const vercelBlobProvider: MediaStorageProvider = {
  id: 'vercel_blob',

  async put(input: PutObjectInput): Promise<PutObjectResult> {
    if (!isVercelBlobConfigured()) {
      const { MediaStorageUnavailableError } = await import('./types');
      throw new MediaStorageUnavailableError();
    }

    const blob = await put(input.pathname, input.body, {
      contentType: input.contentType,
      // ISSUE-2026-09-28-048: the store is public-mode — private put is
      // refused by Vercel Blob. accessMode is enforced at the APPLICATION
      // layer (registry gate + authenticated preview + no public surfaces).
      access: 'public',
      addRandomSuffix: false,
      // Callers own pathname uniqueness (uuid-based); a true collision must
      // surface as an error rather than silently overwrite catalog imagery.
      allowOverwrite: false,
    });

    return {
      url: blob.url,
      pathname: blob.pathname,
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
    };
  },

  async delete(pathname: string): Promise<void> {
    if (!isVercelBlobConfigured()) {
      const { MediaStorageUnavailableError } = await import('./types');
      throw new MediaStorageUnavailableError();
    }
    // del() is idempotent for unknown pathnames.
    await del(pathname);
  },

  async getPrivate(pathname: string) {
    if (!isVercelBlobConfigured()) {
      const { MediaStorageUnavailableError } = await import('./types');
      throw new MediaStorageUnavailableError();
    }
    try {
      const result = await get(pathname, { access: 'private' });
      if (!result || result.statusCode !== 200) return null;
      return { stream: result.stream, contentType: result.blob.contentType };
    } catch (error) {
      // Missing objects are an honest null — the route answers 404; unknown
      // provider failures rethrow for the route's error mapping.
      const name = (error as Error)?.name;
      if (name === 'BlobNotFoundError') return null;
      throw error;
    }
  },
};
