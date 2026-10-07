import Link from "next/link";
import {
  ArrowLeft,
  Baby,
  BriefcaseBusiness,
  Shirt,
  ShoppingBag,
  Smile,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Section, SectionHeading } from "./section";
import { getStorefrontCategoryTree } from "@/lib/storefront/catalog";
import { itemCountPhrase } from "@/lib/storefront/format";

function departmentIcon(slug: string): LucideIcon {
  if (slug.startsWith("women")) return Shirt;
  if (slug.startsWith("men")) return BriefcaseBusiness;
  if (slug.startsWith("kids")) return Smile;
  if (slug.startsWith("baby")) return Baby;
  if (slug.startsWith("cosmetics")) return Sparkles;
  return ShoppingBag;
}

export async function CategoryShowcase({
  framing,
}: {
  framing?: { title?: string | null; subtitle?: string | null } | null;
} = {}) {
  const tree = await getStorefrontCategoryTree();

  return (
    <Section id="categories" aria-labelledby="categories-title" className="bg-surface-subtle/45">
      <SectionHeading
        id="categories-title"
        align="start"
        eyebrow="تسوّقي حسب الفئة"
        title={framing?.title || "اختاري ما يناسبك"}
        description={
          framing?.subtitle ||
          "فئات واضحة ومباشرة تساعدك على الوصول إلى ما تبحثين عنه بسرعة، من الأزياء إلى مستحضرات التجميل."
        }
      />

      {tree.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-gold/40 bg-surface px-6 py-12 text-center text-sm text-muted-foreground">
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
                  className="group flex h-full min-h-[12.5rem] flex-col rounded-3xl border border-border/80 bg-surface p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-gold/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-blush text-primary transition-colors group-hover:bg-blush-deep/60 sm:size-14">
                      <Icon aria-hidden className="size-6 sm:size-7" />
                    </span>
                    <span className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                      <ArrowLeft aria-hidden className="size-4" />
                    </span>
                  </div>
                  <div className="mt-auto pt-8">
                    <h3 className="text-sm font-extrabold sm:text-base">{department.name}</h3>
                    <span className="mt-2 inline-flex rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold text-muted-foreground sm:text-[11px]">
                      {department.productCount > 0
                        ? itemCountPhrase(department.productCount)
                        : "لا توجد منتجات بعد"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
