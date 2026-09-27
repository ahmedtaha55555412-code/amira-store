/**
 * Amira Store — image upload validation (PHASE-04 task 10).
 *
 * Every upload is validated BEFORE it reaches the storage provider:
 * - authorization is checked by the API route (requireAdminMutation);
 * - MIME type: browser-supplied content type is NEVER trusted alone — the
 *   magic bytes of the actual payload must decode to an allowlisted image
 *   format (JPEG / PNG / WebP / AVIF);
 * - size: hard byte ceiling (8 MB) enforced before any decode;
 * - dimensions: decoded via sharp (already a project dependency) — min/max
 *   pixel bounds keep absurd uploads out of the catalog.
 *
 * Validation errors carry short Arabic messages safe to show in the admin UI.
 */

import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
export const MIN_DIMENSION_PX = 100;
export const MAX_DIMENSION_PX = 6000;

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export class ImageValidationError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

/** File-signature sniffing — never trust the declared Content-Type. */
function sniffMime(bytes: Buffer): AllowedImageType | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  // AVIF: ISO-BMFF "ftyp" box with an avif/avis brand at offset 8.
  if (bytes.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return null;
}

export type ValidatedImage = {
  contentType: AllowedImageType;
  bytes: Buffer;
  width: number;
  height: number;
};

/**
 * Validate an uploaded image end-to-end and return normalized facts
 * (sniffed type + dimensions) that the registry stores as metadata truth.
 */
export async function validateImageUpload(input: {
  bytes: Buffer;
  declaredContentType: string | null;
}): Promise<ValidatedImage> {
  const { bytes, declaredContentType } = input;

  if (bytes.length === 0) {
    throw new ImageValidationError('الملف فارغ.');
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError(
      `حجم الصورة يتجاوز الحد الأقصى (${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} ميغابايت).`,
    );
  }

  const sniffed = sniffMime(bytes);
  if (!sniffed) {
    throw new ImageValidationError(
      'صيغة الملف غير مدعومة. الصيغ المسموحة: JPG أو PNG أو WebP أو AVIF.',
    );
  }
  // A mismatch is not fatal (browsers/phones may label WebP as octet-stream),
  // but an explicitly wrong allowlisted claim (e.g. text/plain) is suspicious.
  if (
    declaredContentType &&
    (ALLOWED_IMAGE_TYPES as readonly string[]).includes(declaredContentType) &&
    declaredContentType !== sniffed
  ) {
    throw new ImageValidationError('نوع الملف المعلن لا يطابق محتواه الفعلي.');
  }

  let width: number;
  let height: number;
  try {
    const metadata = await sharp(bytes).metadata();
    width = metadata.width ?? 0;
    height = metadata.height ?? 0;
  } catch {
    throw new ImageValidationError('تعذر قراءة الصورة — الملف تالف أو غير مدعوم.');
  }

  if (
    width < MIN_DIMENSION_PX ||
    height < MIN_DIMENSION_PX ||
    width > MAX_DIMENSION_PX ||
    height > MAX_DIMENSION_PX
  ) {
    throw new ImageValidationError(
      `أبعاد الصورة يجب أن تكون بين ${MIN_DIMENSION_PX} و ${MAX_DIMENSION_PX} بكسل (القياس الحالي ${width}×${height}).`,
    );
  }

  return { contentType: sniffed, bytes, width, height };
}
