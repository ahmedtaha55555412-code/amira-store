/**
 * Amira Store — admin variant search for the order editor (PHASE-08).
 * GET /api/admin/orders/variant-search?q=<sku|product name>
 * Read-only picker feed; results are re-validated server-side on save.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { withNoStore } from '@/lib/auth/origin';
import { requireAdminMutation } from '@/lib/auth/guard';
import { searchVariantsForOrder } from '@/lib/admin/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminMutation();
    const q = request.nextUrl.searchParams.get('q') ?? '';
    const results = await searchVariantsForOrder(q);
    return withNoStore(NextResponse.json({ results }));
  } catch (error) {
    if ((error as { name?: string }).name === 'AdminAuthError') {
      return withNoStore(NextResponse.json({ error: 'غير مصرح.' }, { status: 401 }));
    }
    console.error('[orders-variant-search] unexpected failure', (error as Error)?.name);
    return withNoStore(
      NextResponse.json({ error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' }, { status: 500 }),
    );
  }
}
