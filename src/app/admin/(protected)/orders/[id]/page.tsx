import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, MessageCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatAdminDateTime } from '@/lib/admin/format';
import {
  getOrderDetail,
  MOVEMENT_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TRANSITIONS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TRANSITIONS,
  SHIPPING_STATUS_LABELS,
  SHIPPING_STATUS_TRANSITIONS,
  ACTIVE_ORDER_STATUSES,
  PRE_SHIPMENT_STATUSES,
} from '@/lib/admin/orders';
import { requireAdminPage } from '@/lib/auth/guard';
import { formatPrice } from '@/lib/storefront/format';
import { attributesToLabel } from '@/lib/storefront/checkout';
import { buildWhatsAppUrl, normalizeEgyptianPhone } from '@/lib/storefront/whatsapp';

import {
  OrderStatusActions,
  PaymentStatusActions,
  ShippingCostForm,
  ShippingStatusActions,
} from './order-action-panels';
import { OrderItemsEditor } from './order-items-editor';

/**
 * Full order detail (PHASE-08 tasks 2–3 + §18): historical item snapshots,
 * validated transition panels, WhatsApp-confirmed shipping cost entry, atomic
 * item editor, and the complete inventory-movement + audit trail.
 */

export const metadata: Metadata = {
  title: 'تفاصيل الطلب',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const ACTIVITY_LABELS: Record<string, string> = {
  'order.status_changed': 'تغيير حالة الطلب',
  'order.shipping_status_changed': 'تغيير حالة الشحن',
  'order.payment_status_changed': 'تغيير حالة التحصيل',
  'order.shipping_cost_set': 'إدخال تكلفة الشحن',
  'order.items_updated': 'تعديل بنود الطلب',
};

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();

  const { order, items, movements, activity } = detail;
  const orderActive = ACTIVE_ORDER_STATUSES.includes(order.orderStatus);
  const itemsEditable =
    orderActive && PRE_SHIPMENT_STATUSES.includes(order.shippingStatus);

  // Shipping-confirmation WhatsApp contact (committed snapshot data only).
  const waTarget =
    normalizeEgyptianPhone(order.customerPhoneSnapshot) ??
    order.customerPhoneSnapshot.replace(/[^\d]/g, '');
  const waLines = items
    .map(
      (item) =>
        `- ${item.productNameSnapshot}${item.variantAttributesSnapshot.length ? ` (${attributesToLabel(item.variantAttributesSnapshot)})` : ''} × ${item.quantity}`,
    )
    .join('\n');
  const waMessage = [
    `مرحبًا ${order.customerNameSnapshot} 🌸`,
    `بخصوص طلبك رقم ${order.orderNumber} من أميرة استور:`,
    waLines,
    `إجمالي المنتجات: ${formatPrice(order.productsTotal)}`,
    `عنوان التسليم: ${order.addressSnapshot}`,
    'برجاء تأكيد العنوان وتحديد تكلفة الشحن النهائية. شكرًا لك 🌷',
  ].join('\n');
  const waUrl = buildWhatsAppUrl(waTarget, waMessage);

  const orderAllowed = ORDER_STATUS_TRANSITIONS[order.orderStatus];
  const shippingAllowed =
    order.orderStatus === 'canceled' ? [] : SHIPPING_STATUS_TRANSITIONS[order.shippingStatus];
  const paymentAllowed =
    order.orderStatus === 'canceled' ? [] : PAYMENT_STATUS_TRANSITIONS[order.paymentStatus];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground" dir="ltr">
              {order.orderNumber}
            </h1>
            <Badge variant="outline" className="bg-card">
              {ORDER_STATUS_LABELS[order.orderStatus]}
            </Badge>
            <Badge variant="outline" className="bg-card">
              شحن: {SHIPPING_STATUS_LABELS[order.shippingStatus]}
            </Badge>
            <Badge variant="outline" className="bg-card">
              تحصيل: {PAYMENT_STATUS_LABELS[order.paymentStatus]}
            </Badge>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            أُنشئ: {formatAdminDateTime(order.createdAt)} · آخر تحديث:{' '}
            {formatAdminDateTime(order.updatedAt)} · الدفع: نقدًا عند الاستلام
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
          <Link href="/admin/orders">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            كل الطلبات
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Customer + snapshot card */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">بيانات العميل (لقطة تاريخية)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              الاسم: <span className="font-semibold text-foreground">{order.customerNameSnapshot}</span>
            </p>
            <p className="text-muted-foreground">
              الهاتف:{' '}
              <span className="font-semibold text-foreground" dir="ltr">
                {order.customerPhoneSnapshot}
              </span>
            </p>
            <div className="text-muted-foreground">
              العنوان:
              <p className="mt-1 whitespace-pre-line rounded-lg bg-muted/50 p-2 text-foreground">
                {order.addressSnapshot}
              </p>
            </div>
            {order.notes && (
              <div className="text-muted-foreground">
                ملاحظات:
                <p className="mt-1 whitespace-pre-line rounded-lg bg-muted/50 p-2 text-foreground">
                  {order.notes}
                </p>
              </div>
            )}
            <Separator />
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              مراسلة العميل على واتساب (تأكيد الشحن)
            </a>
          </CardContent>
        </Card>

        {/* Action panels */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">إجراءات الطلب</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">حالة الطلب</p>
              <OrderStatusActions
                orderId={order.id}
                current={order.orderStatus}
                allowed={orderAllowed}
                labels={ORDER_STATUS_LABELS}
              />
            </div>
            <Separator />
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">حالة الشحن</p>
              <ShippingStatusActions
                orderId={order.id}
                current={order.shippingStatus}
                allowed={shippingAllowed}
                labels={SHIPPING_STATUS_LABELS}
              />
            </div>
            <Separator />
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">تحصيل الدفع (نقدًا عند الاستلام)</p>
              <PaymentStatusActions
                orderId={order.id}
                allowed={paymentAllowed}
                labels={PAYMENT_STATUS_LABELS}
              />
            </div>
            <Separator />
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">تكلفة الشحن</p>
              {orderActive ? (
                <ShippingCostForm orderId={order.id} currentCost={order.shippingCost} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  الطلب {ORDER_STATUS_LABELS[order.orderStatus]} — لا يمكن تعديل تكلفة الشحن.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Items (historical snapshots) + editor */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">بنود الطلب (لقطة تاريخية محفوظة)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-start text-xs text-muted-foreground">
                  <th className="py-2 text-start font-medium">المنتج</th>
                  <th className="py-2 text-start font-medium">SKU</th>
                  <th className="py-2 text-start font-medium">السعر الأصلي</th>
                  <th className="py-2 text-start font-medium">سعر البيع وقتها</th>
                  <th className="py-2 text-start font-medium">الكمية</th>
                  <th className="py-2 text-start font-medium">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5">
                      <p className="font-semibold text-foreground">{item.productNameSnapshot}</p>
                      {item.variantAttributesSnapshot.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {attributesToLabel(item.variantAttributesSnapshot)}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground" dir="ltr">
                      {item.skuSnapshot}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {formatPrice(item.originalUnitPriceSnapshot)}
                    </td>
                    <td className="py-2.5 font-semibold text-foreground">
                      {formatPrice(item.unitPrice)}
                    </td>
                    <td className="py-2.5">{item.quantity}</td>
                    <td className="py-2.5 font-semibold text-foreground">
                      {formatPrice(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Separator />

          <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 text-sm">
            <p className="text-muted-foreground">
              إجمالي المنتجات:{' '}
              <span className="font-bold text-foreground">{formatPrice(order.productsTotal)}</span>
            </p>
            <p className="text-muted-foreground">
              الشحن:{' '}
              <span className="font-bold text-foreground">
                {order.shippingCost ? formatPrice(order.shippingCost) : 'بانتظار التأكيد'}
              </span>
            </p>
            <p className="text-base">
              الإجمالي النهائي:{' '}
              <span className="font-extrabold text-primary">{formatPrice(order.grandTotal)}</span>
            </p>
          </div>

          <Separator />

          <div>
            <p className="mb-3 text-xs font-semibold text-muted-foreground">
              تعديل البنود — يُحسب أثر المخزون على الخادم داخل معاملة واحدة (زيادة
              تتحقق من المتاح، ونقص/إزالة يعيده للمخزون، وكل حركة تُسجَّل)
            </p>
            {itemsEditable ? (
              <OrderItemsEditor
                orderId={order.id}
                initialLines={items.map((item) => ({
                  variantId: item.variantId,
                  productName: item.productNameSnapshot,
                  attributesLabel: attributesToLabel(item.variantAttributesSnapshot),
                  sku: item.skuSnapshot,
                  unitPrice: item.unitPrice,
                  quantity: item.quantity,
                  isNew: false,
                }))}
                initialNotes={order.notes ?? ''}
                initialAddress={order.addressSnapshot}
              />
            ) : (
              <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                {order.orderStatus === 'canceled'
                  ? 'الطلب ملغى — بنوده نهائية.'
                  : 'البنود نهائية بعد الشحن/الإكمال — استخدام «فشل التوصيل → إرجاع للمخزون» عند الحاجة.'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inventory movements + audit */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">حركات المخزون المرتبطة بالطلب</CardTitle>
          </CardHeader>
          <CardContent>
            {movements.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا حركات مخزون بعد.</p>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto pe-1">
                {movements.map((movement) => (
                  <li
                    key={movement.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">
                        {MOVEMENT_TYPE_LABELS[movement.movementType]} —{' '}
                        {movement.productName}
                      </p>
                      <p className="text-muted-foreground" dir="ltr">
                        {movement.sku}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="font-semibold text-foreground">
                        {movement.quantityDelta > 0 ? '+' : ''}
                        {movement.quantityDelta} <span className="text-muted-foreground">({movement.stockBefore} ← {movement.stockAfter})</span>
                      </p>
                      <p className="text-muted-foreground">{formatAdminDateTime(movement.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">سجل الإجراءات الإدارية</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا إجراءات مسجلة بعد.</p>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto pe-1">
                {activity.map((entry) => (
                  <li key={entry.id} className="rounded-lg border bg-background p-2.5 text-xs">
                    <p className="font-semibold text-foreground">
                      {ACTIVITY_LABELS[entry.action] ?? entry.action}
                      {entry.adminUsername ? ` — ${entry.adminUsername}` : ''}
                    </p>
                    <p className="mt-0.5 text-muted-foreground" dir="ltr">
                      {entry.metadata ? JSON.stringify(entry.metadata) : ''}
                    </p>
                    <p className="text-muted-foreground">{formatAdminDateTime(entry.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
