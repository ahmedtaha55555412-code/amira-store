/**
 * Amira Store — media service types (PHASE-04 task 9).
 *
 * MASTER_PLAN §20: Vercel Blob is the initial media store, and "the provider
 * implementation must be isolated behind a media service." These types are
 * that boundary: the rest of the application never imports a provider
 * directly, so the storage backend can change without touching UI/API code.
 */

export type PutObjectInput = {
  /** Provider-unique pathname, e.g. "products/<uuid>/gallery-1.webp". */
  pathname: string;
  /** Validated image bytes. */
  body: Buffer;
  contentType: string;
  /**
   * Public catalog imagery (PUBLIC store) vs. private originals (PRIVATE
   * store — storage-level privacy, ISSUE-048 final model). The pathname
   * namespace routes to the store: see vercel-blob.isPrivateStorePathname.
   */
  accessMode: 'public' | 'private';
};

export type PutObjectResult = {
  /**
   * Provider-truth URL for the media registry. For private-store objects
   * this URL is NOT publicly readable (unauthenticated access rejected at
   * the CDN); public delivery of approved content flows through the app's
   * controlled delivery route instead.
   */
  url: string;
  /** Provider-confirmed pathname (may differ in casing — use this value). */
  pathname: string;
  contentType: string;
  sizeBytes: number;
};

export interface MediaStorageProvider {
  readonly id: string;
  /** Persist bytes; returns provider-truth (url/pathname). */
  put(input: PutObjectInput): Promise<PutObjectResult>;
  /** Remove an object (best-effort idempotent). */
  delete(pathname: string): Promise<void>;
  /**
   * Server-side read of a PRIVATE object (requires provider credentials).
   * Used ONLY by admin-authenticated preview routes — a private object must
   * never be exposed to unauthenticated callers (MASTER_PLAN §20, PHASE-09).
   * Returns null when the object does not exist.
   */
  getPrivate?(pathname: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null>;
}

/** Thrown by the service when uploads are not configured (honest 503 path). */
export class MediaStorageUnavailableError extends Error {
  readonly status = 503;
  constructor() {
    super(
      'media storage is not configured (public store: BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID + VERCEL_OIDC_TOKEN inside the Vercel runtime; private store: BLOB_PRIVATE_READ_WRITE_TOKEN)',
    );
    this.name = 'MediaStorageUnavailableError';
  }
}
