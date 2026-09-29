import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { AdminListPager, parsePageParam } from '@/components/admin/list-pager';
import { Button } from '@/components/ui/button';
import { requireAdminPage } from '@/lib/auth/guard';
import { getCategoryTree } from '@/lib/catalog/categories';
import { listProducts } from '@/lib/catalog/products';
import { formatPrice } from '@/lib/storefront/format';

import { ProductListControls } from './product-list-controls';
import { ProductStatusAction } from './product-status-action';

/**
 * Products admin list (PHASE-04 task 2 + PHASE-12 completion): status/category
 * /search filters with link-based pagination, per-product variant/stock/price
 * summary, and a per-row status quick action (draft/active/archived through
 * the audited status route).
 */

export const metadata: Metadata = {
  title: 'المنتجات',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة',
  active: 'نشط',
  archived: 'مؤرشف',
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; q?: string; page?: string }>;
}) {
  await requireAdminPage();
  const params = await searchParams;

  const status =
    params.status === 'draft' || params.status === 'active' || params.status === 'archived'
      ? params.status
      : 'all';
  const categoryId = params.category && /^[0-9a-f-]{36}$/i.test(params.category) ? params.category : null;
  const search = params.q?.slice(0, 100) ?? null;
  const page = parsePageParam(params.page);
  const PAGE_SIZE = 50;

  const [{ items, total }, tree] = await Promise.all([
    listProducts({
      status,
      categoryId,
      search,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getCategoryTree(true),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const flatCategories = flattenCategories(tree);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <section>
          <h1 className="text-2xl font-bold text-foreground">إدارة المنتجات</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {total} منتجًا. أنشئ المنتجات وأدِر المتغيرات والأسعار والصور ودليل
            المقاسات من محرر المنتج.
          </p>
        </section>
        <Button asChild className="gap-2">
          <Link href="/admin/products/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            منتج جديد
          </Link>
        </Button>
      </div>

      <ProductListControls
        categories={flatCategories}
        currentStatus={status}
        currentCategoryId={categoryId}
        currentSearch={search}
      />

      <div className="overflow-hidden rounded-2xl border bg-card">
        {items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            لا توجد منتجات مطابقة. أنشئ منتجًا جديدًا للبدء.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((product) => (
              <li key={product.id} className="p-4 transition-colors hover:bg-muted/40">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${
                      product.status === 'active'
                        ? 'bg-success/10 text-success'
                        : product.status === 'draft'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-blush text-secondary-foreground'
                    }`}
                  >
                    {STATUS_LABEL[product.status]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {product.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {product.categoryName} ·{' '}
                      <span dir="ltr">/{product.slug}</span> · {product.variantCount} متغير ·
                      المخزون: {product.totalStock}
                      {product.minCurrentPrice
                        ? ` · من ${formatPrice(product.minCurrentPrice)}`
                        : ''}
                      {product.hasDiscount ? ' · عليه خصم' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProductStatusAction
                      productId={product.id}
                      productName={product.name}
                      status={product.status}
                    />
                    <Button asChild variant="outline" size="sm" className="rounded-full">
                      <Link href={`/admin/products/${product.id}`}>تحرير</Link>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AdminListPager
        basePath="/admin/products"
        page={page}
        pageCount={pageCount}
        total={total}
        params={{
          status: status !== 'all' ? status : undefined,
          category: categoryId ?? undefined,
          q: search || undefined,
        }}
        label="منتج"
      />
    </div>
  );
}

type TreeCategory = {
  id: string;
  name: string;
  children: TreeCategory[];
};

function flattenCategories(tree: TreeCategory[]): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  const walk = (nodes: TreeCategory[], depth: number) => {
    for (const node of nodes) {
      out.push({ id: node.id, label: `${'— '.repeat(depth)}${node.name}` });
      walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return out;
}
