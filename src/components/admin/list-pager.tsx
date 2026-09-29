import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Admin list pager (PHASE-12): link-based pagination that PRESERVES the
 * current filter query string. Server-rendered (no client JS), RTL-aware,
 * min 44px touch targets. Renders nothing when there is a single page.
 */

export function AdminListPager({
  basePath,
  page,
  pageCount,
  total,
  params,
  label = 'عنصر',
}: {
  basePath: string;
  page: number;
  pageCount: number;
  total: number;
  params: Record<string, string | undefined>;
  label?: string;
}) {
  if (pageCount <= 1) {
    return (
      <p className="text-xs text-muted-foreground">
        {total.toLocaleString('ar-EG-u-nu-latn')} {label} في هذا العرض.
      </p>
    );
  }

  function hrefFor(target: number): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) next.set(key, value);
    }
    if (target > 1) next.set('page', String(target));
    const query = next.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  const windowStart = Math.max(1, Math.min(page - 2, pageCount - 4));
  const windowEnd = Math.min(pageCount, windowStart + 4);
  const pages: number[] = [];
  for (let p = windowStart; p <= windowEnd; p += 1) pages.push(p);

  return (
    <nav
      aria-label="تصفح الصفحات"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-xs text-muted-foreground">
        صفحة {page.toLocaleString('ar-EG-u-nu-latn')} من{' '}
        {pageCount.toLocaleString('ar-EG-u-nu-latn')} —{' '}
        {total.toLocaleString('ar-EG-u-nu-latn')} {label} إجمالًا.
      </p>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href={hrefFor(page - 1)}>السابق</Link>
          </Button>
        ) : null}
        {pages.map((p) => (
          <Button
            key={p}
            asChild
            variant={p === page ? 'default' : 'outline'}
            size="sm"
            className="min-w-9 rounded-full px-3"
            aria-current={p === page ? 'page' : undefined}
          >
            <Link href={hrefFor(p)}>{p.toLocaleString('ar-EG-u-nu-latn')}</Link>
          </Button>
        ))}
        {page < pageCount ? (
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href={hrefFor(page + 1)}>التالي</Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

/** Clamp/normalize a ?page= search param (invalid → 1). */
export function parsePageParam(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 10_000);
}
