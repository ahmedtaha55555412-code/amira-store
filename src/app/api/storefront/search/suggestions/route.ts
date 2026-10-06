/**
 * Amira Store — public search suggestions endpoint (PHASE-05 task 5).
 *
 * Backs the header autocomplete. Read-only, public catalog data:
 * - zod-validated query (trimmed, 2–80 chars after Arabic normalization);
 * - never leaks internal ids the UI does not need;
 * - responses carry Cache-Control: no-store so suggestion state is always
 *   fresh while the catalog changes;
 * - JSON only. Authentication is intentionally absent (public storefront);
 *   abuse-limiting for public endpoints is revisited in the PHASE-13
 *   security pass (MASTER_PLAN §24 rate-limit list targets admin/tracking/
 *   review/checkout, not catalog reads).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { getSearchSuggestions } from '@/lib/storefront/catalog';
import { normalizeArabic } from '@/lib/storefront/arabic';
import { consumeDurableRateLimit } from '@/lib/storefront/durable-rate-limit';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().max(80).optional().default(''),
});

function clientIpHash(request: NextRequest): string {
  const candidates = [
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    request.headers.get('x-real-ip')?.trim(),
  ].filter((value): value is string => Boolean(value));
  return createHash('sha256').update(candidates[0] ?? 'unknown').digest('hex');
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get('q') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'استعلام بحث غير صالح.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const normalized = normalizeArabic(parsed.data.q);
  if (normalized.length < 2) {
    // Too short to be meaningful — an empty (not an error) payload keeps the
    // client dropdown closed without a red error path.
    return NextResponse.json(
      { products: [], categories: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const rate = await consumeDurableRateLimit({
      scope: 'storefront:search-suggestions',
      keyHash: clientIpHash(request),
      windowMs: 60_000,
      maxAttempts: 60,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'محاولات كثيرة جدًا — برجاء المحاولة بعد قليل.' },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(rate.retryAfterSeconds),
          },
        },
      );
    }

    const suggestions = await getSearchSuggestions(parsed.data.q);
    return NextResponse.json(suggestions, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Log the error name only — no internals leak (PHASE-03 logging policy).
    console.error('[storefront/suggestions] failed:', (error as Error).name);
    return NextResponse.json(
      { error: 'تعذر جلب اقتراحات البحث.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
