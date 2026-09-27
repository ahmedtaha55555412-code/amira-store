import {
  Baby,
  Briefcase,
  Shirt,
  Smile,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Section, SectionHeading } from "./section";

type CategoryPlaceholder = {
  name: string;
  icon: LucideIcon;
};

/** The five primary departments (MASTER_PLAN §2) — pages arrive with the catalog phase. */
const CATEGORIES: CategoryPlaceholder[] = [
  { name: "أزياء نسائية", icon: Shirt },
  { name: "أزياء رجالية", icon: Briefcase },
  { name: "أزياء أطفال", icon: Smile },
  { name: "أزياء المواليد", icon: Baby },
  { name: "مستحضرات التجميل", icon: Sparkles },
];

/** Category showcase placeholder — intentional, honest shell for PHASE-01. */
export function CategoryShowcase() {
  return (
    <Section id="categories" aria-labelledby="categories-title" className="bg-surface-subtle/50">
      <SectionHeading
        id="categories-title"
        eyebrow="تسوّق حسب القسم"
        title="أقسام أميرة استور"
        description="خمسة أقسام رئيسية تغطي احتياجات كل أفراد العائلة — تُفتح صفحاتها ويُربط عدّاد المنتجات عند اكتمال بيانات المتجر."
      />

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {CATEGORIES.map(({ name, icon: Icon }) => (
          <li key={name}>
            <article className="group flex h-full flex-col items-center gap-3 rounded-2xl border bg-surface p-5 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md sm:p-6">
              <span className="flex size-14 items-center justify-center rounded-full bg-blush text-primary transition-colors group-hover:bg-blush-deep/70">
                <Icon aria-hidden className="size-7" />
              </span>
              <h3 className="text-sm font-bold sm:text-base">{name}</h3>
              <span className="mt-auto rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
                قريبًا
              </span>
            </article>
          </li>
        ))}
      </ul>
    </Section>
  );
}
