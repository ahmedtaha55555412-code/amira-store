import type { Metadata } from 'next';

import { requireAdminPage } from '@/lib/auth/guard';
import { getAdminHomepageSections, getAdminBanners } from '@/lib/admin/homepage';

import { HomepageManager } from './homepage-manager';

export const metadata: Metadata = {
  title: 'محتوى الصفحة الرئيسية',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const SECTION_LABELS: Record<string, string> = {
  announcement: 'شريط الإعلانات',
  hero: 'البانر الرئيسي',
  categories: 'الأقسام',
  new_arrivals: 'وصل حديثًا (تلقائي)',
  offers: 'العروض (تلقائي)',
  benefits: 'لماذا أميرة استور',
  brand_story: 'قصتنا',
  reviews: 'تقييمات العملاء (تلقائي)',
  testimonials: 'آراء واتساب (تلقائي)',
  whatsapp_cta: 'دعوة التواصل',
};

/**
 * Admin homepage manager (PHASE-10): section visibility/order/copy + hero
 * banners. Query-driven sections («وصل حديثًا» / «العروض» / التقييمات /
 * شهادات واتساب) stay query-driven — the manager only edits their framing
 * (title/subtitle/visibility/order); there is NO product-selection control
 * anywhere (hard exclusion, MASTER_PLAN §4).
 */
export default async function AdminHomepagePage() {
  await requireAdminPage();

  const [sections, banners] = await Promise.all([
    getAdminHomepageSections(),
    getAdminBanners(),
  ]);

  const knownLabels = new Set(Object.keys(SECTION_LABELS));

  return (
    <HomepageManager
      sections={sections.map((s) => ({
        id: s.id,
        sectionKey: s.sectionKey,
        label: SECTION_LABELS[s.sectionKey] ?? s.sectionKey,
        known: knownLabels.has(s.sectionKey),
        title: s.title,
        subtitle: s.subtitle,
        isEnabled: s.isEnabled,
        sortOrder: s.sortOrder,
        config: (s.config ?? null) as Record<string, unknown> | null,
      }))}
      banners={banners.map((b) => ({
        id: b.id,
        title: b.title,
        subtitle: b.subtitle,
        ctaLabel: b.ctaLabel,
        ctaHref: b.ctaHref,
        isActive: b.isActive,
        sortOrder: b.sortOrder,
        startsAt: b.startsAt ? b.startsAt.toISOString() : null,
        endsAt: b.endsAt ? b.endsAt.toISOString() : null,
        mediaUrl: b.mediaUrl,
      }))}
    />
  );
}
