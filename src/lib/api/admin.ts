/**
 * Amira Store — shared admin-API mutation plumbing (PHASE-04).
 *
 * Every admin mutation route: (1) same-origin gate, (2) session
 * authorization, (3) zod validation, (4) service call, (5) THIS error
 * mapping. All responses carry Cache-Control: no-store (session-sensitive).
 * Service errors are intentionally Arabic + specific; unexpected errors are
 * generic and never leak internals.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AdminAuthError } from '@/lib/auth/guard';
import { isJsonRequest, isSameOriginRequest, withNoStore } from '@/lib/auth/origin';
import { AttributeServiceError } from '@/lib/catalog/attributes';
import { CategoryServiceError } from '@/lib/catalog/categories';
import { PricingValidationError } from '@/lib/catalog/pricing';
import { ProductServiceError } from '@/lib/catalog/products';
import { ImageValidationError } from '@/lib/media/validation';
import { MediaStorageUnavailableError } from '@/lib/media/types';
import { OrderServiceError } from '@/lib/admin/orders';
import { ReviewModerationError } from '@/lib/admin/reviews';
import { TestimonialServiceError } from '@/lib/admin/testimonials';
import { HomepageServiceError } from '@/lib/admin/homepage';
import { SettingsServiceError } from '@/lib/admin/settings';
import { ReviewServiceError } from '@/lib/storefront/reviews';

/** JSON body gate: same-origin + application/json. Returns a 403 response when rejected. */
export function guardJsonMutation(request: Request): NextResponse | null {
  if (!isSameOriginRequest(request) || !isJsonRequest(request)) {
    return withNoStore(NextResponse.json({ error: 'طلب غير صالح.' }, { status: 403 }));
  }
  return null;
}

/** Same-origin gate for non-JSON mutations (multipart uploads). */
export function guardMutation(request: Request): NextResponse | null {
  if (!isSameOriginRequest(request)) {
    return withNoStore(NextResponse.json({ error: 'طلب غير صالح.' }, { status: 403 }));
  }
  return null;
}

export function jsonOk(data: Record<string, unknown> = { ok: true }): NextResponse {
  return withNoStore(NextResponse.json(data));
}

/** Map service/domain errors to honest Arabic error responses. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AdminAuthError) {
    return withNoStore(NextResponse.json({ error: 'غير مصرح.' }, { status: 401 }));
  }
  if (error instanceof ZodError) {
    const first = error.issues[0]?.message ?? 'بيانات غير صالحة.';
    return withNoStore(NextResponse.json({ error: first }, { status: 400 }));
  }
  const known = [
    CategoryServiceError,
    AttributeServiceError,
    ProductServiceError,
    PricingValidationError,
    ImageValidationError,
    OrderServiceError,
    ReviewModerationError,
    TestimonialServiceError,
    ReviewServiceError,
    SettingsServiceError,
    HomepageServiceError,
    // Honest unconfigured-storage path (MASTER_PLAN §20): status 503 with the
    // exact remediation message — never a generic 500.
    MediaStorageUnavailableError,
  ];
  for (const kind of known) {
    if (error instanceof kind) {
      return withNoStore(
        NextResponse.json(
          { error: error.message },
          { status: (error as { status?: number }).status ?? 422 },
        ),
      );
    }
  }
  // Unexpected: log only the error class — never request bodies or internals.
  console.error('[admin-mutation] unexpected failure', (error as Error)?.name);
  return withNoStore(
    NextResponse.json(
      { error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' },
      { status: 500 },
    ),
  );
}

/** Parse a JSON body; returns null when the payload is not parseable. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
