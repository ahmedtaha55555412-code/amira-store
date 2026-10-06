/**
 * Amira Store — review submission endpoint (PHASE-09 step 2).
 *
 * POST /api/storefront/reviews — multipart/form-data with:
 *   orderNumber, phone, orderItemId, rating, comment, image? (File)
 *
 * The optional image travels INSIDE the submission: there is NO anonymous
 * upload endpoint, so a review that is never submitted can never leave an
 * orphaned media asset behind. The image is registered PRIVATE and only
 * materializes public if/when moderation approves the review.
 *
 * Security posture (checkout pattern): same-origin + multipart BEFORE any
 * parsing; durable DB-backed rate limit keyed by HASHED client IP; no-store;
 * server derives product/verified/status facts from the matched order rows —
 * client identifiers only; duplicate verified reviews → 409; malformed or
 * oversized images → 422 with the media service's Arabic message.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

import { isSameOriginRequest, withNoStore } from '@/lib/auth/origin';
import { ImageValidationError } from '@/lib/media/validation';
import {
  ReviewServiceError,
  reviewSubmissionSchema,
  submitReview,
} from '@/lib/storefront/reviews';
import { consumeDurableRateLimit } from '@/lib/storefront/durable-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIpHash(request: NextRequest): string {
  const candidates = [
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    request.headers.get('x-real-ip')?.trim(),
  ].filter((value): value is string => Boolean(value));
  return createHash('sha256').update(candidates[0] ?? 'unknown').digest('hex');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return withNoStore(
      NextResponse.json({ error: 'طلب غير صالح.' }, { status: 403 }),
    );
  }

  const rate = await consumeDurableRateLimit({
    scope: 'storefront:review-submit',
    keyHash: clientIpHash(request),
    windowMs: 30 * 60_000,
    maxAttempts: 8,
  });
  if (!rate.allowed) {
    return withNoStore(
      NextResponse.json(
        { error: 'محاولات كثيرة جدًا — برجاء المحاولة بعد قليل.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      ),
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return withNoStore(
      NextResponse.json({ error: 'بيانات التقييم غير صالحة.' }, { status: 400 }),
    );
  }

  const image = form.get('image');
  if (image !== null && !(image instanceof File)) {
    return withNoStore(
      NextResponse.json({ error: 'ملف الصورة غير صالح.' }, { status: 400 }),
    );
  }

  const parsed = reviewSubmissionSchema.safeParse({
    orderNumber: form.get('orderNumber'),
    phone: form.get('phone'),
    orderItemId: form.get('orderItemId'),
    rating: Number(form.get('rating')),
    comment: form.get('comment'),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return withNoStore(
      NextResponse.json(
        { error: first?.message ?? 'بيانات التقييم غير مكتملة.' },
        { status: 400 },
      ),
    );
  }

  try {
    const result = await submitReview({
      fields: parsed.data,
      image:
        image instanceof File && image.size > 0
          ? {
              bytes: Buffer.from(await image.arrayBuffer()),
              declaredContentType: image.type || null,
            }
          : null,
    });
    return withNoStore(
      NextResponse.json(
        {
          ok: true as const,
          reviewId: result.reviewId,
          message: 'شكرًا لك! تم استلام تقييمك وسيظهر على المتجر بعد المراجعة.',
        },
        { status: 201 },
      ),
    );
  } catch (error) {
    if (error instanceof ReviewServiceError) {
      return withNoStore(
        NextResponse.json({ error: error.message }, { status: error.status }),
      );
    }
    if (error instanceof ImageValidationError) {
      return withNoStore(
        NextResponse.json({ error: error.message }, { status: 422 }),
      );
    }
    console.error('[storefront/reviews] submission failed:', (error as Error).name);
    return withNoStore(
      NextResponse.json(
        { error: 'تعذر إرسال التقييم — برجاء المحاولة مرة أخرى.' },
        { status: 500 },
      ),
    );
  }
}
