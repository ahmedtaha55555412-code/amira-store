import type { Metadata } from 'next';

import { requireAdminPage } from '@/lib/auth/guard';
import { getCategoryTree } from '@/lib/catalog/categories';

import { CategoryManager } from './category-manager';

/**
 * Categories admin (PHASE-04 task 1): recursive tree management with
 * parent/child support, sort order, activation, and guarded deletes.
 */

export const metadata: Metadata = {
  title: 'الأصناف',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminCategoriesPage() {
  await requireAdminPage();
  const tree = await getCategoryTree(true);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-foreground">إدارة الأصناف</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          أنشئ الأقسام الرئيسية والأقسام الفرعية ورتّبها. لا يمكن حذف قسم
          يحتوي أقسامًا فرعية أو منتجات — انقل المحتوى أولًا.
        </p>
      </section>

      <CategoryManager initialTree={tree} />
    </div>
  );
}
