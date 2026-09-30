/**
 * Amira Store — customer order tracking endpoint (PHASE-13).
 *
 * POST /api/storefront/track-order — matches an order by number + checkout
 * phone and returns a customer-safe tracking view (status timeline derived
 * from the CURRENT order/shipping states per MASTER_PLAN §14).
 *
 * Security posture (reviews-lookup pattern): same-origin + JSON before any
 * parsing; per-instance rate limit keyed by HASHED client IP; no-store;
 * unknown number, wrong phone and empty order return the IDENTICAL generic
 * error — no order-existence oracle; no internal IDs, address or phone in
 * the response.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

import { isJsonRequest, isSameOriginRequest, withNoStore } from '@/lib/auth/origin';
import {
  TrackingServiceError,
  lookupOrderForTracking,
  trackingLookupRateLimit,
  trackingLookupSchema,
} from '@/lib/storefront/tracking';

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

  if (!trackingLookupRateLimit(clientIpHash(request))) {
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

  const parsed = trackingLookupSchema.safeParse(body);
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
    const order = await lookupOrderForTracking(parsed.data);
    return withNoStore(NextResponse.json({ ok: true as const, order }, { status: 200 }));
  } catch (error) {
    if (error instanceof TrackingServiceError) {
      return withNoStore(
        NextResponse.json({ error: error.message }, { status: error.status }),
      );
    }
    console.error('[storefront/track-order] failure:', (error as Error).name);
    return withNoStore(
      NextResponse.json(
        { error: 'تعذر جلب حالة الطلب — برجاء المحاولة مرة أخرى.' },
        { status: 500 },
      ),
    );
  }
}
