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
 * NOTE: access "public" maps to Blob's default public store behavior
 * (MASTER_PLAN §20: public catalog imagery; admin-only originals would use
 * the private store in a later phase that consumes them).
 */

import { del, put } from '@vercel/blob';

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
};
