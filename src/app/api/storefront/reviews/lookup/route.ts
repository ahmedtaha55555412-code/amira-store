/**
 * Amira Store — review order lookup endpoint (PHASE-09 step 1).
 *
 * POST /api/storefront/reviews/lookup — matches an order by number + checkout
 * phone and returns its DELIVERED, not-yet-reviewed items (no PII echo).
 *
 * Security posture (checkout pattern): same-origin + JSON before any parsing;
 * per-instance rate limit keyed by HASHED client IP; no-store; wrong number
 * and wrong phone return the IDENTICAL generic error — no order-existence
 * oracle (MASTER_PLAN §14 discipline carried into the review flow).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

import { isJsonRequest, isSameOriginRequest, withNoStore } from '@/lib/auth/origin';
import {
  ReviewServiceError,
  lookupReviewableOrder,
  reviewLookupSchema,
  reviewSubmissionRateLimit,
} from '@/lib/storefront/reviews';

export const dynamic = 'force-dynamic';

function clientIpHash(request: NextRequest): string {
  const candidates = [
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    request.headers.get('x-real-ip')?.trim(),
  ].filter((value): value is string => Boolean(value));
  return createHash('sha256').update(candidates[0] ?? 'unknown').digest('hex');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(request) || !isJsonRequest(request)) {
    return withNoStore(
      NextResponse.json({ error: 'طلب غير صالح.' }, { status: 403 }),
    );
  }

  if (!reviewSubmissionRateLimit(clientIpHash(request))) {
    return withNoStore(
      NextResponse.json(
        { error: 'محاولات كثيرة جدًا — برجاء المحاولة بعد قليل.' },
        { status: 429, headers: { 'Retry-After': '300' } },
      ),
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withNoStore(
      NextResponse.json({ error: 'بيانات الطلب غير صالحة.' }, { status: 400 }),
    );
  }

  const parsed = reviewLookupSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return withNoStore(
      NextResponse.json(
        { error: first?.message ?? 'برجاء إدخال رقم الطلب ورقم الموبايل.' },
        { status: 400 },
      ),
    );
  }

  try {
    const items = await lookupReviewableOrder(parsed.data);
    return withNoStore(NextResponse.json({ ok: true as const, items }, { status: 200 }));
  } catch (error) {
    if (error instanceof ReviewServiceError) {
      return withNoStore(
        NextResponse.json({ error: error.message }, { status: error.status }),
      );
    }
    console.error('[storefront/reviews-lookup] failure:', (error as Error).name);
    return withNoStore(
      NextResponse.json(
        { error: 'تعذر التحقق من الطلب — برجاء المحاولة مرة أخرى.' },
        { status: 500 },
      ),
    );
  }
}
