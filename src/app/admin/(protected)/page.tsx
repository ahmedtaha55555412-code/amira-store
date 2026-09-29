import {
  ArrowLeftCircle,
  Boxes,
  ClipboardList,
  KeyRound,
  MessageSquareQuote,
  ShieldCheck,
  Star,
  Warehouse,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAdminDateTime } from '@/lib/admin/format';
import {
  getDashboardData,
  type DashboardActivityRow,
  type DashboardLowStockRow,
  type DashboardOrderRow,
} from '@/lib/admin/dashboard';
import { requireAdminPage } from '@/lib/auth/guard';
import { formatPrice } from '@/lib/storefront/format';

/**
 * Admin dashboard (PHASE-12): operational control-center home.
 * Every metric, queue, and feed row comes from REAL database truth via
 * `getDashboardData()` (src/lib/admin/dashboard.ts) — nothing is fabricated,
 * and the page performs zero mutations. Sections:
 * 1. metrics summary  2. order queues  3. low stock  4. recent activity
 * plus the account/security cards and the module directory.
 */

export const metadata: Metadata = {
  title: 'لوحة التحكم',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const liveModules = [
  { title: 'المنتجات والمتغيرات', href: '/admin/products', icon: Boxes },
  { title: 'الأصناف', href: '/admin/categories', icon: Boxes },
  { title: 'الطلبات', href: '/admin/orders', icon: ClipboardList },
  { title: 'المخزون وسجل الحركات', href: '/admin/inventory', icon: Warehouse },
  { title: 'المراجعات', href: '/admin/reviews', icon: Star },
  { title: 'شهادات واتساب', href: '/admin/testimonials', icon: MessageSquareQuote },
  { title: 'محتوى الصفحة الرئيسية', href: '/admin/homepage', icon: Boxes },
  { title: 'مكتبة الوسائط', href: '/admin/media', icon: Boxes },
  { title: 'إعدادات المتجر', href: '/admin/settings', icon: ShieldCheck },
] as const;

/** Arabic labels for the audit action vocabulary (unknown actions fall back to the raw value). */
const ACTION_LABELS: Record<string, string> = {
  'auth.login.success': 'تسجيل دخول',
  'auth.login.failed': 'محاولة دخول فاشلة',
  'auth.logout': 'تسجيل خروج',
  'auth.password_changed': 'تغيير كلمة المرور',
  'catalog.product.created': 'إنشاء منتج',
  'catalog.product.saved': 'حفظ منتج',
  'catalog.product.status_changed': 'تغيير حالة منتج',
  'catalog.category.created': 'إنشاء صنف',
  'catalog.category.updated': 'تحديث صنف',
  'catalog.category.deleted': 'حذف صنف',
  'catalog.category.reordered': 'إعادة ترتيب الأصناف',
  'catalog.attribute.created': 'إنشاء خصيصة',
  'catalog.attribute.deleted': 'حذف خصيصة',
  'catalog.attribute_value.created': 'إنشاء قيمة خصيصة',
  'catalog.attribute_value.deleted': 'حذف قيمة خصيصة',
  'order.status_changed': 'تغيير حالة الطلب',
  'order.shipping_status_changed': 'تغيير حالة الشحن',
  'order.shipping_cost_set': 'تسجيل تكلفة الشحن',
  'order.payment_status_changed': 'تغيير حالة الدفع',
  'order.items_updated': 'تعديل بنود الطلب',
  approved: 'اعتماد مراجعة',
  rejected: 'رفض مراجعة',
  'testimonials.create': 'إضافة شهادة واتساب',
  'testimonials.publish': 'نشر شهادة واتساب',
  'testimonials.hide': 'إخفاء شهادة واتساب',
  'testimonials.update': 'تحديث شهادة واتساب',
  'inventory.stock.adjusted': 'تعديل مخزون يدوي',
  create: 'إنشاء',
  update: 'تحديث',
  delete: 'حذف',
  reorder: 'إعادة ترتيب',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const ENTITY_LABELS: Record<string, string> = {
  order: 'طلب',
  product: 'منتج',
  category: 'صنف',
  attribute: 'خصيصة',
  attribute_value: 'قيمة خصيصة',
  review: 'مراجعة',
  testimonial: 'شهادة واتساب',
  homepage_section: 'قسم رئيسي',
  homepage_banner: 'بانر',
  media_asset: 'وسيط',
  store_settings: 'إعدادات المتجر',
  admin_auth: 'مصادقة',
};

function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

export default async function AdminDashboardPage() {
  const [{ admin }, data] = await Promise.all([requireAdminPage(), getDashboardData()]);
  const { metrics, queues, lowStock, activity } = data;

  const lastLogin = admin.lastLoginAt
    ? formatAdminDateTime(admin.lastLoginAt)
    : 'أول تسجيل دخول سيُسجَّل بعد الآن';

  const metricCards: Array<{
    label: string;
    value: string;
    hint?: string;
    href: string;
    tone?: 'alert' | 'warn' | 'ok';
  }> = [
    {
      label: 'طلبات جديدة',
      value: String(metrics.newOrders),
      hint: 'بانتظار أول إجراء',
      href: '/admin/orders?status=new',
      tone: metrics.newOrders > 0 ? 'alert' : undefined,
    },
    {
      label: 'تحت المراجعة',
      value: String(metrics.underReviewOrders),
      hint: 'فتح وتأكيد التفاصيل',
      href: '/admin/orders?status=under_review',
      tone: metrics.underReviewOrders > 0 ? 'warn' : undefined,
    },
    {
      label: 'طلبات نشطة',
      value: String(metrics.activeOrders),
      hint: 'في خط سير العمل',
      href: '/admin/orders',
    },
    {
      label: 'تحصيل COD معلّق',
      value: String(metrics.codPendingOrders),
      hint: 'غير ملغي ولم يُحصَّل',
      href: '/admin/orders?payment=pending',
    },
    {
      label: 'إجمالي الطلبات',
      value: formatPrice(metrics.grandTotalNonCanceled),
      hint: 'غير شاملة الملغي — قبل/بعد تسجيل الشحن',
      href: '/admin/orders',
    },
    {
      label: 'مخزون منخفض',
      value: String(metrics.lowStockVariants),
      hint: 'عند أو تحت حد التنبيه',
      href: '/admin/inventory?view=low',
      tone: metrics.lowStockVariants > 0 ? 'warn' : undefined,
    },
    {
      label: 'نفد المخزون',
      value: String(metrics.outOfStockVariants),
      hint: 'متغيرات بكمية صفر',
      href: '/admin/inventory?view=out',
      tone: metrics.outOfStockVariants > 0 ? 'alert' : undefined,
    },
    {
      label: 'مراجعات بانتظار الاعتماد',
      value: String(metrics.pendingReviews),
      href: '/admin/reviews?status=pending',
      tone: metrics.pendingReviews > 0 ? 'warn' : undefined,
    },
    {
      label: 'شهادات واتساب غير منشورة',
      value: String(metrics.draftTestimonials),
      href: '/admin/testimonials',
    },
    {
      label: 'منتجات نشطة',
      value: String(metrics.activeProducts),
      hint: `مسودة: ${metrics.draftProducts} · مؤرشف: ${metrics.archivedProducts}`,
      href: '/admin/products',
    },
    {
      label: 'متغيرات قابلة للبيع',
      value: String(metrics.activeVariants),
      href: '/admin/inventory',
    },
    {
      label: 'أصول الوسائط',
      value: String(metrics.mediaAssets),
      href: '/admin/media',
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-6">
        <h1 className="text-2xl font-bold text-foreground">
          أهلًا بك، {admin.username} 👋
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          لوحة تحكم متجر أميرة استور — ملخص التشغيل من بيانات المتجر الحقيقية:
          طوابير الطلبات، المخزون المنخفض، والنشاط التشغيلي الأخير.
        </p>
      </section>

      {/* 1) Summary metrics — real database truth */}
      <section aria-labelledby="metrics-heading" className="space-y-3">
        <h2 id="metrics-heading" className="text-lg font-bold text-foreground">
          ملخص الأرقام
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {metricCards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="group rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <p
                className={`mt-1.5 text-2xl font-extrabold ${
                  card.tone === 'alert'
                    ? 'text-destructive'
                    : card.tone === 'warn'
                      ? 'text-amber-700'
                      : 'text-foreground'
                }`}
              >
                {card.value}
              </p>
              {card.hint ? (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {card.hint}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      {/* 2) Order queues */}
      <section aria-labelledby="queues-heading" className="space-y-3">
        <h2 id="queues-heading" className="text-lg font-bold text-foreground">
          طوابير الطلبات
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <OrderQueueCard
            title="طلبات جديدة (بانتظار أول إجراء)"
            href="/admin/orders?status=new"
            rows={queues.newOrders}
            emptyText="لا توجد طلبات جديدة حاليًا."
          />
          <OrderQueueCard
            title="تحت المراجعة (بحاجة تأكيد)"
            href="/admin/orders?status=under_review"
            rows={queues.underReview}
            emptyText="لا توجد طلبات تحت المراجعة."
          />
        </div>
      </section>

      {/* 3) Low stock */}
      <section aria-labelledby="lowstock-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="lowstock-heading" className="text-lg font-bold text-foreground">
            المخزون الأدنى
          </h2>
          <Link
            href="/admin/inventory?view=low"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/50"
          >
            عرض كامل في إدارة المخزون
            <ArrowLeftCircle className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {lowStock.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-surface-subtle/50 px-6 py-8 text-center text-sm text-muted-foreground">
            كل الكميات فوق حد التنبيه — لا يوجد مخزون منخفض.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {lowStock.map((row) => (
              <LowStockRow key={row.variantId} row={row} />
            ))}
          </ul>
        )}
      </section>

      {/* 4) Recent operational activity */}
      <section aria-labelledby="activity-heading" className="space-y-3">
        <h2 id="activity-heading" className="text-lg font-bold text-foreground">
          النشاط التشغيلي الأخير
        </h2>
        {activity.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-surface-subtle/50 px-6 py-8 text-center text-sm text-muted-foreground">
            لا يوجد نشاط مسجل بعد.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {activity.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>

      {/* Account + security */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              الحساب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p className="text-muted-foreground">
              اسم المستخدم:{' '}
              <span className="font-semibold text-foreground" dir="ltr">
                {admin.username}
              </span>
            </p>
            <p className="text-muted-foreground">
              الحالة:{' '}
              <span className="font-semibold text-success">نشط</span>
            </p>
            <p className="text-muted-foreground">
              آخر دخول:{' '}
              <span className="font-semibold text-foreground">{lastLogin}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
              أمان الحساب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              يمكنك تغيير كلمة المرور من داخل اللوحة (تتطلب كلمة المرور
              الحالية). تغيير كلمة المرور يُنهي جميع الجلسات النشطة.
            </p>
            <Link
              href="/admin/settings/security"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ArrowLeftCircle className="h-4 w-4" aria-hidden="true" />
              تغيير كلمة المرور
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Module directory */}
      <section aria-labelledby="live-modules-heading" className="space-y-3">
        <h2 id="live-modules-heading" className="text-lg font-bold text-foreground">
          كل الإدارات
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {liveModules.map((module) => (
            <Link
              key={module.title}
              href={module.href}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <module.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-foreground">{module.title}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function OrderQueueCard({
  title,
  href,
  rows,
  emptyText,
}: {
  title: string;
  href: string;
  rows: DashboardOrderRow[];
  emptyText: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <Link
          href={href}
          className="inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/50"
        >
          الكل
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="mt-3 divide-y">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/orders/${row.id}`}
                className="flex flex-wrap items-center gap-2 rounded-lg py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="text-xs font-bold text-primary" dir="ltr">
                  {row.orderNumber}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {row.customerName}
                </span>
                <span className="text-xs text-muted-foreground">{row.itemCount} بنود</span>
                <span className="text-xs font-semibold text-foreground">
                  {formatPrice(row.grandTotal)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {formatAdminDateTime(row.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LowStockRow({ row }: { row: DashboardLowStockRow }) {
  const isOut = row.stockQuantity === 0;
  return (
    <li>
      <Link
        href={`/admin/inventory?variant=${row.variantId}`}
        className="flex flex-wrap items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold ${
            isOut ? 'bg-destructive/10 text-destructive' : 'bg-blush text-secondary-foreground'
          }`}
        >
          {row.stockQuantity}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {row.productName}
        </span>
        <span className="truncate text-xs text-muted-foreground" dir="ltr">
          {row.sku}
        </span>
        <Badge variant="outline" className="bg-card">
          حد التنبيه: {row.lowStockThreshold}
        </Badge>
      </Link>
    </li>
  );
}

function ActivityRow({ row }: { row: DashboardActivityRow }) {
  const summary = ActivitySummary(row);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <span className="text-sm font-semibold text-foreground">{actionLabel(row.action)}</span>
      <Badge variant="outline" className="bg-card">
        {entityLabel(row.entityType)}
      </Badge>
      {summary ? (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{summary}</span>
      ) : (
        <span className="flex-1" />
      )}
      <span className="text-xs text-muted-foreground" dir="ltr">
        {row.adminUsername ?? 'النظام'}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {formatAdminDateTime(row.createdAt)}
      </span>
    </li>
  );
}

/** A short, honest human summary from sanitized audit metadata (never secrets). */
function ActivitySummary(row: DashboardActivityRow): string | null {
  const meta = row.metadata;
  if (!meta) return null;
  if (row.entityType === 'order' && typeof meta.orderNumber === 'string') {
    const parts: string[] = [meta.orderNumber];
    if (typeof meta.from === 'string' && typeof meta.to === 'string') {
      parts.push(`: ${meta.from} → ${meta.to}`);
    }
    return parts.join('');
  }
  if (typeof meta.orderNumber === 'string') return meta.orderNumber;
  if (typeof meta.fields === 'object' && Array.isArray(meta.fields)) {
    return (meta.fields as unknown[]).filter((f) => typeof f === 'string').join('، ');
  }
  return null;
}
