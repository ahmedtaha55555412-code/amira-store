/**
 * Amira Store — Vercel Blob storage provider (PHASE-04 task 9).
 *
 * Thin adapter over @vercel/blob. Configuration is checked lazily: when
 * BLOB_READ_WRITE_TOKEN is absent the service layer surfaces an honest
 * "not configured" state instead of failing mid-upload (see service.ts).
 *
 * NOTE: @vercel/blob reads BLOB_READ_WRITE_TOKEN from the environment at
 * call time; access "public" maps to Blob's default public store behavior
 * (MASTER_PLAN §20: public catalog imagery; admin-only originals would use
 * the private store in a later phase that consumes them).
 */

import { del, put } from '@vercel/blob';

import type {
  MediaStorageProvider,
  PutObjectInput,
  PutObjectResult,
} from './types';

export function isVercelBlobConfigured(): boolean {
  const token = process.env['BLOB_READ_WRITE_TOKEN'];
  return typeof token === 'string' && token.trim().length > 0;
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
