import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireAdminPage } from '@/lib/auth/guard';
import { formatAdminDateTime } from '@/lib/admin/format';
import {
  getVariantLedger,
  listInventoryVariants,
  MOVEMENT_TYPE_LABELS,
  type InventoryView,
} from '@/lib/admin/orders';

import { StockAdjustButton } from './stock-adjuster';

/**
 * Inventory ledger + stock views (PHASE-08 tasks 14–15) + manual adjustment
 * (PHASE-12): the ledger is the audit record of every movement (sales, order
 * edits, cancellations, and — since PHASE-12 — admin manual adjustments with
 * a mandatory reason, written through the transactional
 * /api/admin/inventory/adjust route).
 */

export const metadata: Metadata = {
  title: 'المخزون',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const VIEW_LABELS: Record<InventoryView, string> = {
  all: 'كل المتغيرات',
  low: 'مخزون منخفض',
  out: 'نفد المخزون',
};

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; variant?: string }>;
}) {
  await requireAdminPage();
  const params = await searchParams;

  const view: InventoryView =
    params.view === 'low' || params.view === 'out' ? params.view : 'all';
  const search = params.q?.slice(0, 100) ?? '';
  const selectedVariantId = params.variant ?? null;

  const [{ items, total }, ledger] = await Promise.all([
    listInventoryVariants({ view, search: search || null, limit: 100 }),
    selectedVariantId ? getVariantLedger(selectedVariantId) : Promise.resolve(null),
  ]);

  function viewHref(nextView: InventoryView): string {
    const params2 = new URLSearchParams();
    if (nextView !== 'all') params2.set('view', nextView);
    if (search) params2.set('q', search);
    const query = params2.toString();
    return query ? `/admin/inventory?${query}` : '/admin/inventory';
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-foreground">المخزون وسجل الحركات</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          سجل الحركات هو المصدر التدقيقي لكل تغيّر في الكميات (بيع، تعديل
          طلبات، إرجاع إلغاء، تعديل يدوي بسبب مُصرّح به). اضغط على أي متغير
          لعرض حركاته بالتفصيل، أو استخدم «تعديل» لتعديل الكمية بسبب إلزامي.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(VIEW_LABELS) as InventoryView[]).map((key) => (
          <Button
            key={key}
            asChild
            size="sm"
            variant={view === key ? 'default' : 'outline'}
            className="rounded-full"
          >
            <Link href={viewHref(key)}>{VIEW_LABELS[key]}</Link>
          </Button>
        ))}
        <form action="/admin/inventory" method="get" className="ms-auto flex items-center gap-2">
          {view !== 'all' && <input type="hidden" name="view" value={view} />}
          {selectedVariantId && <input type="hidden" name="variant" value={selectedVariantId} />}
          <Input
            name="q"
            defaultValue={search}
            placeholder="بحث بالاسم أو SKU"
            className="h-9 w-52 rounded-full"
            aria-label="بحث في المخزون"
          />
          <Button type="submit" size="sm" variant="outline" className="rounded-full">
            بحث
          </Button>
        </form>
      </div>

      {/* Selected variant ledger */}
      {ledger && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              سجل حركات:{' '}
              <span className="font-extrabold text-foreground">{ledger.variant.productName}</span>
              <span dir="ltr" className="text-sm font-medium text-muted-foreground">
                {ledger.variant.sku}
              </span>
              <Badge variant="outline" className="bg-card">
                المتاح الآن: {ledger.variant.stockQuantity}
              </Badge>
              <span className="text-xs font-normal text-muted-foreground">
                حد التنبيه: {ledger.variant.lowStockThreshold}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ledger.movements.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا حركات مسجلة لهذا المتغير بعد.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto rounded-xl border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                    <tr className="text-start text-xs text-muted-foreground">
                      <th className="p-2.5 text-start font-medium">الحركة</th>
                      <th className="p-2.5 text-start font-medium">الكمية</th>
                      <th className="p-2.5 text-start font-medium">قبل ← بعد</th>
                      <th className="p-2.5 text-start font-medium">الطلب</th>
                      <th className="p-2.5 text-start font-medium">بواسطة</th>
                      <th className="p-2.5 text-start font-medium">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ledger.movements.map((movement) => (
                      <tr key={movement.id} className="bg-card">
                        <td className="p-2.5">
                          <p className="font-semibold text-foreground">
                            {MOVEMENT_TYPE_LABELS[movement.movementType]}
                          </p>
                          {movement.reason && (
                            <p className="text-[11px] text-muted-foreground">{movement.reason}</p>
                          )}
                        </td>
                        <td className={`p-2.5 font-bold ${movement.quantityDelta > 0 ? 'text-success' : 'text-destructive'}`}>
                          {movement.quantityDelta > 0 ? '+' : ''}
                          {movement.quantityDelta}
                        </td>
                        <td className="p-2.5 text-muted-foreground" dir="ltr">
                          {movement.stockBefore} ← {movement.stockAfter}
                        </td>
                        <td className="p-2.5">
                          {movement.orderNumber && movement.orderId ? (
                            <Link
                              href={`/admin/orders/${movement.orderId}`}
                              className="text-xs font-semibold text-primary hover:underline"
                              dir="ltr"
                            >
                              {movement.orderNumber}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2.5 text-xs text-muted-foreground">
                          {movement.adminUsername ?? 'النظام'}
                        </td>
                        <td className="p-2.5 text-xs text-muted-foreground">
                          {formatAdminDateTime(movement.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Variants list */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        {items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            لا توجد متغيرات مطابقة لهذا العرض.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((variant) => {
              const isOut = variant.stockQuantity === 0;
              const isLow = !isOut && variant.stockQuantity <= variant.lowStockThreshold;
              return (
                <li key={variant.variantId} className="flex flex-wrap items-center gap-2 p-3 transition-colors hover:bg-muted/40">
                  <Link
                    href={`/admin/inventory?variant=${variant.variantId}${view !== 'all' ? `&view=${view}` : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold ${
                        isOut
                          ? 'bg-destructive/10 text-destructive'
                          : isLow
                            ? 'bg-blush text-secondary-foreground'
                            : 'bg-success/10 text-success'
                      }`}
                    >
                      {variant.stockQuantity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {variant.productName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" dir="ltr">
                        {variant.sku}
                      </p>
                    </div>
                    {isOut && <Badge className="bg-destructive/10 text-destructive">نفد</Badge>}
                    {isLow && <Badge className="bg-blush text-secondary-foreground">منخفض</Badge>}
                    {!variant.isActive && (
                      <Badge variant="outline" className="bg-card">
                        غير مفعّل
                      </Badge>
                    )}
                    {variant.productStatus === 'archived' && (
                      <Badge variant="outline" className="bg-card">
                        مؤرشف
                      </Badge>
                    )}
                  </Link>
                  <StockAdjustButton
                    variantId={variant.variantId}
                    sku={variant.sku}
                    productName={variant.productName}
                    stockQuantity={variant.stockQuantity}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {total} متغيرًا في هذا العرض{total > items.length ? ` (يُعرض أول ${items.length})` : ''}.
      </p>
    </div>
  );
}
