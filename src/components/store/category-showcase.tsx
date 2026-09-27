import Link from "next/link";
import {
  Baby,
  Briefcase,
  Shirt,
  ShoppingBag,
  Smile,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Section, SectionHeading } from "./section";
import { getStorefrontCategoryTree } from "@/lib/storefront/catalog";

/** Department icon mapping by slug prefix — decorative fallback for new departments. */
function departmentIcon(slug: string): LucideIcon {
  if (slug.startsWith("women")) return Shirt;
  if (slug.startsWith("men")) return Briefcase;
  if (slug.startsWith("kids")) return Smile;
  if (slug.startsWith("baby")) return Baby;
  if (slug.startsWith("cosmetics")) return Sparkles;
  return ShoppingBag;
}

/**
 * Category showcase (PHASE-05 task 2/3): the five real departments from the
 * database, linked to their listing pages with live product counts.
 */
export async function CategoryShowcase() {
  const tree = await getStorefrontCategoryTree();

  return (
    <Section id="categories" aria-labelledby="categories-title" className="bg-surface-subtle/50">
      <SectionHeading
        id="categories-title"
        eyebrow="تسوّق حسب القسم"
        title="أقسام أميرة استور"
        description="خمسة أقسام رئيسية تغطي احتياجات كل أفراد العائلة — اختاري قسمك وابدئي التسوق."
      />

      {tree.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-surface px-6 py-10 text-center text-sm text-muted-foreground">
          الأقسام تُجهَّز حاليًا — تفضّلي بزيارتنا قريبًا.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {tree.map((department) => {
            const Icon = departmentIcon(department.slug);
            return (
              <li key={department.id}>
                <Link
                  href={`/category/${encodeURIComponent(department.slug)}`}
                  className="group flex h-full flex-col items-center gap-3 rounded-2xl border bg-surface p-5 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-14 items-center justify-center rounded-full bg-blush text-primary transition-colors group-hover:bg-blush-deep/70">
                    <Icon aria-hidden className="size-7" />
                  </span>
                  <h3 className="text-sm font-bold sm:text-base">{department.name}</h3>
                  <span className="mt-auto rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
                    {department.productCount > 0
                      ? `${department.productCount.toLocaleString("ar-EG-u-nu-latn")} منتج`
                      : "قريبًا"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
