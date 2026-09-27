/**
 * Amira Store — cart availability endpoint (PHASE-06 task 6).
 *
 * Read-only companion of the guest cart: the client posts the variant ids it
 * holds and receives per-variant live truth (active flags, stock, current
 * price) so out-of-stock/price-change states are CLEAR before checkout
 * (docs/phases/PHASE-06.md verification: "out-of-stock states are clear").
 *
 * Discipline mirrors the storefront suggestions endpoint (PHASE-05):
 * - zod-validated body (1–50 variant ids, deduplicated);
 * - Cache-Control: no-store (stock/price are always live truth);
 * - no internals leak — errors log the name only;
 * - NO cart state is created server-side; there is intentionally NO customer
 *   account endpoint anywhere (PHASE-06 verification).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getVariantsAvailability } from '@/lib/storefront/availability';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  variantIds: z
    .array(z.string().uuid())
    .min(1)
    .max(50)
    .transform((ids) => Array.from(new Set(ids))),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'طلب غير صالح.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'معرّفات المنتجات غير صالحة.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const availability = await getVariantsAvailability(parsed.data.variantIds);
    return NextResponse.json(
      { availability },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    // Log the error name only — no internals leak (PHASE-03 logging policy).
    console.error('[storefront/cart-availability] failed:', (error as Error).name);
    return NextResponse.json(
      { error: 'تعذر التحقق من توفر المنتجات.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
