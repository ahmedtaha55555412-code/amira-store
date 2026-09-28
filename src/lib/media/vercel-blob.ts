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
 * TWO-STORE ARCHITECTURE (ISSUE-2026-09-28-048 final resolution, PHASE-09
 * closure directive): the public-mode store cannot hold private objects
 * (put-private is refused by Vercel Blob on a public store), so sensitive
 * originals now live in a REAL PRIVATE Blob store:
 *
 *   PUBLIC STORE  — amira-store-media (store_bP1wi1NtS4fRkbRh), OIDC —
 *                   existing catalog/product/public imagery. UNCHANGED.
 *   PRIVATE STORE — amira-testimonials-private, access:'private' — every
 *                   upload whose accessMode is 'private' (pending review
 *                   images, draft WhatsApp testimonial screenshots). All
 *                   reads/writes/deletes route by the pathname namespace
 *                   ({@link isPrivateStorePathname}) using the store-scoped
 *                   BLOB_PRIVATE_READ_WRITE_TOKEN that Vercel's own store
 *                   connection injected (per-call explicit token wins the
 *                   SDK's resolution order). The OIDC pair for the public
 *                   store is untouched.
 *
 * A private-store object's URL (https://<store>.private.blob.vercel-storage.com/…)
 * is NOT publicly readable — unauthenticated direct access is rejected at the
 * CDN. Registry `url` keeps that provider-truth value; public delivery of
 * APPROVED content happens exclusively through the app's controlled delivery
 * route (/api/media/[id]) which gates on the registry access_mode AND the
 * owning entity's status before streaming server-side (Vercel's documented
 * private-blob delivery pattern). The original never leaves the private store.
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

/** Store-scoped credential for the PRIVATE store (Vercel connection-injected). */
function privateStoreToken(): string | null {
  const value = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Whether the PRIVATE store credential surface exists in this environment. */
export function isPrivateBlobConfigured(): boolean {
  return privateStoreToken() !== null;
}

/**
 * Pathname namespaces that live in the PRIVATE store. PHASE-09 private
 * uploads use exactly these folders (`uploadImage` callers: reviews.ts
 * folder 'reviews', admin/testimonials.ts folder 'testimonials'); the public
 * store never holds objects under these prefixes (verified against both DBs
 * at the ISSUE-048 closure: zero legacy rows).
 */
const PRIVATE_STORE_PATH_PREFIXES = ['reviews/', 'testimonials/'] as const;

export function isPrivateStorePathname(pathname: string): boolean {
  return PRIVATE_STORE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export const vercelBlobProvider: MediaStorageProvider = {
  id: 'vercel_blob',

  async put(input: PutObjectInput): Promise<PutObjectResult> {
    if (input.accessMode === 'private') {
      const token = privateStoreToken();
      if (!token) {
        // Honest configuration error: the private store is required for
        // private uploads; a public store would REFUSE the put anyway.
        const { MediaStorageUnavailableError } = await import('./types');
        throw new MediaStorageUnavailableError();
      }
      const blob = await put(input.pathname, input.body, {
        contentType: input.contentType,
        // Storage-level privacy: the PRIVATE store rejects unauthenticated
        // reads of this object at the CDN (structural, not app-level).
        access: 'private',
        addRandomSuffix: false,
        // Callers own pathname uniqueness (uuid-based); a true collision must
        // surface as an error rather than silently overwrite content.
        allowOverwrite: false,
        token,
      });
      return {
        url: blob.url,
        pathname: blob.pathname,
        contentType: input.contentType,
        sizeBytes: input.body.byteLength,
      };
    }

    if (!isVercelBlobConfigured()) {
      const { MediaStorageUnavailableError } = await import('./types');
      throw new MediaStorageUnavailableError();
    }

    // Public catalog imagery — the original public-store path (OIDC/env
    // auth, public access). UNCHANGED by the two-store architecture.
    const blob = await put(input.pathname, input.body, {
      contentType: input.contentType,
      access: 'public',
      addRandomSuffix: false,
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
    if (isPrivateStorePathname(pathname)) {
      const token = privateStoreToken();
      if (!token) {
        const { MediaStorageUnavailableError } = await import('./types');
        throw new MediaStorageUnavailableError();
      }
      // del() is idempotent for unknown pathnames.
      await del(pathname, { token });
      return;
    }

    if (!isVercelBlobConfigured()) {
      const { MediaStorageUnavailableError } = await import('./types');
      throw new MediaStorageUnavailableError();
    }
    await del(pathname);
  },

  async getPrivate(pathname: string) {
    if (isPrivateStorePathname(pathname)) {
      const token = privateStoreToken();
      if (!token) {
        const { MediaStorageUnavailableError } = await import('./types');
        throw new MediaStorageUnavailableError();
      }
      try {
        const result = await get(pathname, { access: 'private', token });
        if (!result || result.statusCode !== 200) return null;
        return { stream: result.stream, contentType: result.blob.contentType };
      } catch (error) {
        const name = (error as Error)?.name;
        if (name === 'BlobNotFoundError') return null;
        throw error;
      }
    }

    // Legacy path: public-store objects read with server credentials
    // (public-stored blobs accept authenticated private reads — the
    // ISSUE-048 interim model). No such objects remain in either DB, but
    // the read path is kept honest until the public store is confirmed empty.
    if (!isVercelBlobConfigured()) {
      const { MediaStorageUnavailableError } = await import('./types');
      throw new MediaStorageUnavailableError();
    }
    try {
      const result = await get(pathname, { access: 'private' });
      if (!result || result.statusCode !== 200) return null;
      return { stream: result.stream, contentType: result.blob.contentType };
    } catch (error) {
      const name = (error as Error)?.name;
      if (name === 'BlobNotFoundError') return null;
      throw error;
    }
  },
};
