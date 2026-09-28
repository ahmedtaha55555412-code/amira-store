import type { Metadata } from 'next';
import Link from 'next/link';

import { requireAdminPage } from '@/lib/auth/guard';
import { formatAdminDateTime } from '@/lib/admin/format';
import {
  listAdminTestimonials,
  listTestimonialProductOptions,
} from '@/lib/admin/testimonials';

import { TestimonialsManager } from './testimonials-manager';

export const metadata: Metadata = {
  title: 'شهادات واتساب',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const FILTERS = [
  { value: 'draft', label: 'مسودات' },
  { value: 'published', label: 'منشورة' },
  { value: 'hidden', label: 'مخفية' },
  { value: 'all', label: 'الكل' },
] as const;

/**
 * WhatsApp testimonials admin (PHASE-09): upload customer screenshots
 * (registered PRIVATE), publish with the mandatory privacy confirmation,
 * hide, order, and associate with products. A WhatsApp testimonial is always
 * labeled as such on the storefront — never as a site review.
 */
export default async function AdminTestimonialsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPage();
  const params = await searchParams;

  const raw = params.status ?? 'all';
  const status = (FILTERS.find((f) => f.value === raw)?.value ?? 'all') as
    | 'draft'
    | 'published'
    | 'hidden'
    | 'all';

  const [{ items, total }, productOptions] = await Promise.all([
    listAdminTestimonials({ status, limit: 200 }),
    listTestimonialProductOptions(),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-foreground">شهادات واتساب</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {total.toLocaleString('ar-EG-u-nu-latn')} شهادة. لقطات الشاشة تبقى
          خاصة (تُعرض داخل اللوحة فقط) حتى النشر، والنشر يتطلب تأكيد مراجعة
          الخصوصية. تُعرض في المتجر دائمًا مع شارة «عبر واتساب» — ولا تُقدَّم
          أبدًا كمراجعة موقع.
        </p>
      </section>

      <TestimonialsManager items={items} productOptions={productOptions} />

      <nav aria-label="تصفية الحالة" className="flex flex-wrap gap-2 border-t pt-4">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={`/admin/testimonials?status=${filter.value}`}
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
    </div>
  );
}
