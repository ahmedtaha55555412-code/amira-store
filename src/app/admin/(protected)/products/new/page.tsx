import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireAdminPage } from '@/lib/auth/guard';
import { getCategoryTree } from '@/lib/catalog/categories';

import { NewProductForm } from './new-product-form';

/**
 * Create-product page (PHASE-04 task 2): creates the draft, then the full
 * editor (variants / images / size guide) takes over at /admin/products/[id].
 */

export const metadata: Metadata = {
  title: 'منتج جديد',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  await requireAdminPage();
  const tree = await getCategoryTree(true);
  const categories = flatten(tree);

  if (categories.length === 0) {
    // Honest gate: a product cannot exist without a category.
    redirect('/admin/categories');
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-foreground">منتج جديد</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          أدخل الاسم والقسم لإنشاء مسودة، ثم أكمل المتغيرات والصور في محرر
          المنتج.
        </p>
      </section>
      <div className="rounded-2xl border bg-card p-6">
        <NewProductForm categories={categories} />
      </div>
    </div>
  );
}

type TreeCategory = {
  id: string;
  name: string;
  children: TreeCategory[];
};

function flatten(tree: TreeCategory[]): Array<{ id: string; label: string }> {
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
