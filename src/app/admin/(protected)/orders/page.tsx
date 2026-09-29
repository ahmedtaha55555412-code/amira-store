import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminListPager, parsePageParam } from '@/components/admin/list-pager';
import { requireAdminPage } from '@/lib/auth/guard';
import { formatAdminDateTime } from '@/lib/admin/format';
import {
  listOrders,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  SHIPPING_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
  type ShippingStatus,
} from '@/lib/admin/orders';
import { formatPrice } from '@/lib/storefront/format';

import { OrderListControls } from './order-list-controls';

/**
 * Orders admin list (PHASE-08 task 1 + PHASE-12 pagination):
 * status/shipping/payment filters, order-number/customer/phone search,
 * newest-first, link-based pager preserving all filters.
 */

export const metadata: Metadata = {
  title: 'الطلبات',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUS_CHIP: Record<OrderStatus, string> = {
  new: 'bg-muted text-foreground',
  under_review: 'bg-blush text-secondary-foreground',
  confirmed: 'bg-primary/10 text-primary',
  preparing: 'bg-primary/10 text-primary',
  completed: 'bg-success/10 text-success',
  canceled: 'bg-destructive/10 text-destructive',
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    shipping?: string;
    payment?: string;
    q?: string;
    page?: string;
  }>;
}) {
  await requireAdminPage();
  const params = await searchParams;

  const status = (params.status ?? 'all') as OrderStatus | 'all';
  const shippingStatus = (params.shipping ?? 'all') as ShippingStatus | 'all';
  const paymentStatus = (params.payment ?? 'all') as PaymentStatus | 'all';
  const search = params.q?.slice(0, 100) ?? '';
  const page = parsePageParam(params.page);
  const PAGE_SIZE = 50;

  const { items, total } = await listOrders({
    status,
    shippingStatus,
    paymentStatus,
    search: search || null,
    limit: PAGE_SIZE,
    page,
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-foreground">إدارة الطلبات</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {total} طلبًا. تابع الطلبات من الإنشاء حتى التسليم، وأدخل تكلفة الشحن
          بعد تأكيدها عبر واتساب، وعدّل البنود بأمان مع تسجيل أثر المخزون.
        </p>
      </section>

      <OrderListControls
        currentStatus={status}
        currentShippingStatus={shippingStatus}
        currentPaymentStatus={paymentStatus}
        currentSearch={search}
      />

      <div className="overflow-hidden rounded-2xl border bg-card">
        {items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            لا توجد طلبات مطابقة. ستظهر الطلبات الجديدة هنا تلقائيًا بعد إتمام
            العملاء لعملية الدفع عند الاستلام.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((order) => (
              <li key={order.id} className="p-4 transition-colors hover:bg-muted/40">
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-foreground" dir="ltr">
                      {order.orderNumber}
                    </span>
                    <span
                      className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold ${STATUS_CHIP[order.orderStatus]}`}
                    >
                      {ORDER_STATUS_LABELS[order.orderStatus]}
                    </span>
                    <span className="inline-flex h-7 items-center rounded-full border bg-surface-subtle px-2.5 text-xs font-medium text-foreground-muted">
                      شحن: {SHIPPING_STATUS_LABELS[order.shippingStatus]}
                    </span>
                    <span className="inline-flex h-7 items-center rounded-full border bg-surface-subtle px-2.5 text-xs font-medium text-foreground-muted">
                      تحصيل: {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {order.customerName} ·{' '}
                    <span dir="ltr">{order.customerPhone}</span> · {order.itemCount} بند ·
                    الإجمالي:{' '}
                    <span className="font-semibold text-foreground">
                      {formatPrice(order.grandTotal)}
                    </span>{' '}
                    · {formatAdminDateTime(order.createdAt)}
                    {order.shippingCost
                      ? ` · شحن: ${formatPrice(order.shippingCost)}`
                      : ' · الشحن: بانتظار التأكيد'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AdminListPager
        basePath="/admin/orders"
        page={page}
        pageCount={pageCount}
        total={total}
        params={{
          status: status !== 'all' ? status : undefined,
          shipping: shippingStatus !== 'all' ? shippingStatus : undefined,
          payment: paymentStatus !== 'all' ? paymentStatus : undefined,
          q: search || undefined,
        }}
        label="طلب"
      />
    </div>
  );
}
