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
  /** Public catalog imagery vs. admin-only originals (MASTER_PLAN §20). */
  accessMode: 'public' | 'private';
};

export type PutObjectResult = {
  /** Public (or signed) URL to store in the media registry. */
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
}

/** Thrown by the service when uploads are not configured (honest 503 path). */
export class MediaStorageUnavailableError extends Error {
  readonly status = 503;
  constructor() {
    super('media storage is not configured (BLOB_READ_WRITE_TOKEN missing)');
    this.name = 'MediaStorageUnavailableError';
  }
}
