/**
 * Amira Store — storefront checkout endpoint (PHASE-07).
 *
 * POST /api/storefront/checkout — the ONLY order-creation surface.
 *
 * Request: { items: [{variantId, quantity}], customerName, customerPhone,
 * address, note?, idempotencyKey } — zod-validated; prices/stock/names/SKUs
 * are NEVER accepted from the client (MASTER_PLAN §24; the service re-reads
 * live database truth).
 *
 * Security posture (mirrors the PHASE-03 storefront/admin pattern):
 * - explicit same-origin CSRF control (Origin/Referer attestation) + JSON
 *   content-type enforcement BEFORE any parsing/database work;
 * - durable DB-backed fixed-window rate limit keyed by a HASHED client IP
 *   (MASTER_PLAN §24: rate-limit checkout; raw addresses never stored);
 * - `Cache-Control: no-store` on every response;
 * - error responses log the error NAME only (no internals, no secrets);
 * - customer-facing errors never reveal whether a customer/variant exists
 *   beyond what the submitting client already knows (its own cart ids).
 *
 * Failure semantics (PHASE-07): stock/activity rejection → 409 with per-line
 * reasons and NO database change; DB failure → 500, no partial order;
 * duplicate submit → 200 with the SAME committed order (idempotent replay);
 * WhatsApp never blocks order validity.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

import { isJsonRequest, isSameOriginRequest, withNoStore } from '@/lib/auth/origin';
import {
  checkoutRequestSchema,
  createOrderFromCart,
} from '@/lib/storefront/checkout';
import { consumeDurableRateLimit } from '@/lib/storefront/durable-rate-limit';

export const dynamic = 'force-dynamic';

/** First forwarded/private IP candidate → one-way hash (rate-limit key). */
function clientIpHash(request: NextRequest): string {
  const candidates = [
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    request.headers.get('x-real-ip')?.trim(),
  ].filter((value): value is string => Boolean(value));
  return createHash('sha256').update(candidates[0] ?? 'unknown').digest('hex');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // CSRF control first — same discipline as every state-changing endpoint.
  if (!isSameOriginRequest(request) || !isJsonRequest(request)) {
    return withNoStore(
      NextResponse.json({ error: 'طلب غير صالح.' }, { status: 403 }),
    );
  }

  // Durable DB-backed rate limit shared across deployed instances — protects stock and WhatsApp noise.
  const rate = await consumeDurableRateLimit({
    scope: 'storefront:checkout',
    keyHash: clientIpHash(request),
    windowMs: 5 * 60_000,
    maxAttempts: 12,
  });
  if (!rate.allowed) {
    return withNoStore(
      NextResponse.json(
        { error: 'محاولات كثيرة جدًا — برجاء المحاولة بعد قليل.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
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

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    // Field-level Arabic message when available; generic otherwise.
    const first = parsed.error.issues[0];
    return withNoStore(
      NextResponse.json(
        { error: first?.message ?? 'بيانات الطلب غير مكتملة.' },
        { status: 400 },
      ),
    );
  }

  try {
    const outcome = await createOrderFromCart(parsed.data);

    if (outcome.status === 'rejected') {
      return withNoStore(
        NextResponse.json(
          {
            ok: false as const,
            error: 'بعض المنتجات في سلتك لم تعد متاحة بالكمية المطلوبة.',
            lineErrors: outcome.lineErrors,
          },
          { status: 409 },
        ),
      );
    }

    // 'created' and 'idempotent_replay' return the SAME customer-facing
    // payload — a duplicate submit can never look like a second order.
    return withNoStore(
      NextResponse.json(
        { ok: true as const, order: outcome.payload },
        { status: 200 },
      ),
    );
  } catch (error) {
    // Log the name only — no internals/stack/secrets in logs (PHASE-03 policy).
    console.error('[storefront/checkout] order creation failed:', (error as Error).name);
    return withNoStore(
      NextResponse.json(
        { error: 'تعذر إنشاء الطلب — برجاء المحاولة مرة أخرى.' },
        { status: 500 },
      ),
    );
  }
}
