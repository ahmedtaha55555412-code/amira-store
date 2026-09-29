import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminListPager, parsePageParam } from '@/components/admin/list-pager';
import { requireAdminPage } from '@/lib/auth/guard';
import { formatAdminDateTime } from '@/lib/admin/format';
import {
  listAdminReviews,
  type AdminReviewListItem,
  type AdminReviewStatus,
} from '@/lib/admin/reviews';

import { ReviewModerationControls } from './review-moderation-controls';

export const metadata: Metadata = {
  title: 'المراجعات',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUS_CHIP: Record<AdminReviewStatus, string> = {
  pending: 'bg-warning/15 text-amber-700',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
};

const STATUS_LABEL: Record<AdminReviewStatus, string> = {
  pending: 'بانتظار المراجعة',
  approved: 'معتمدة',
  rejected: 'مرفوضة',
};

const FILTERS: { value: AdminReviewStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'بانتظار المراجعة' },
  { value: 'approved', label: 'معتمدة' },
  { value: 'rejected', label: 'مرفوضة' },
  { value: 'all', label: 'الكل' },
];

/**
 * Reviews moderation admin (PHASE-09 + PHASE-12 pagination): the moderation
 * queue for site reviews. Approving publishes the review (and materializes
 * its image public); rejecting hides it from all public surfaces. Approved
 * verified reviews carry «مشتري موثّق» on the storefront. Product names link
 * to the product's own editor.
 */
export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdminPage();
  const params = await searchParams;

  const raw = params.status ?? 'pending';
  const status = (FILTERS.find((f) => f.value === raw)?.value ?? 'pending') as
    | AdminReviewStatus
    | 'all';
  const page = parsePageParam(params.page);
  const PAGE_SIZE = 50;

  const { items, total, pendingCount } = await listAdminReviews({
    status,
    limit: PAGE_SIZE,
    page,
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-foreground">إدارة المراجعات</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {total.toLocaleString('ar-EG-u-nu-latn')} مراجعة إجمالًا —{' '}
          <span className="font-semibold text-amber-700">
            {pendingCount.toLocaleString('ar-EG-u-nu-latn')} بانتظار المراجعة
          </span>
          . المراجعات المعتمدة فقط تظهر على المتجر، وصور العملاء تبقى خاصة حتى
          الاعتماد.
        </p>
      </section>

      <nav aria-label="تصفية الحالة" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={`/admin/reviews?status=${filter.value}`}
            aria-current={filter.value === status ? 'page' : undefined}
            className={
              filter.value === status
                ? 'inline-flex min-h-9 items-center rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground'
                : 'inline-flex min-h-9 items-center rounded-full border px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50'
            }
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-surface-subtle/60 px-6 py-12 text-center text-sm text-muted-foreground">
          لا توجد مراجعات في هذه الحالة.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((review) => (
            <li key={review.id}>
              <ReviewCard review={review} statusLabel={STATUS_LABEL[review.status]} statusChip={STATUS_CHIP[review.status]} />
            </li>
          ))}
        </ul>
      )}

      <AdminListPager
        basePath="/admin/reviews"
        page={page}
        pageCount={pageCount}
        total={total}
        params={{ status: raw }}
        label="مراجعة"
      />
    </div>
  );
}

function ReviewCard({
  review,
  statusLabel,
  statusChip,
}: {
  review: AdminReviewListItem;
  statusLabel: string;
  statusChip: string;
}) {
  return (
    <article className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusChip}`}
        >
          {statusLabel}
        </span>
        {review.isVerifiedPurchase ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
            مشتري موثّق
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {formatAdminDateTime(review.createdAt)}
        </span>
        {review.orderNumber ? (
          <span className="text-xs text-muted-foreground" dir="ltr">
            {review.orderNumber}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <div className="flex items-center gap-1" aria-label={`التقييم: ${review.rating} من 5`}>
            {Array.from({ length: 5 }).map((_, index) => (
              <span
                key={index}
                aria-hidden
                className={
                  index < review.rating
                    ? 'text-base text-gold-deep'
                    : 'text-base text-muted-foreground/40'
                }
              >
                ★
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-sm leading-loose text-foreground">{review.comment}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            المنتج:{' '}
            <Link
              href={`/admin/products/${review.productId}`}
              className="font-semibold text-foreground hover:underline"
            >
              {review.productName}
            </Link>
          </p>
        </div>

        {review.image ? (
          <div className="shrink-0">
            {/* The admin content route serves BOTH modes honestly: private
                originals stream authenticated; public assets 302 to the CDN. */}
            <img
              src={`/api/admin/media/${review.image.mediaAssetId}/content`}
              alt="صورة أرفقها العميل مع مراجعته"
              loading="lazy"
              className="size-24 rounded-xl border object-cover"
            />
          </div>
        ) : null}
      </div>

      <ReviewModerationControls reviewId={review.id} status={review.status} />
    </article>
  );
}
