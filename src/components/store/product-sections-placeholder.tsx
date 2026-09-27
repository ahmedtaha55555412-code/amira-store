import { Image as ImageIcon, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Section, SectionHeading } from "./section";

/**
 * Product section placeholders (PHASE-01 shell).
 * Honest skeletons: these sections become data-driven in later phases —
 * «وصل حديثًا» by real createdAt, «العروض» by real variant discounts only.
 */
function ProductCardPlaceholder() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-surface shadow-sm">
      <div className="relative aspect-[4/5] bg-surface-subtle">
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon aria-hidden className="size-10 text-muted-foreground/40" />
        </div>
      </div>
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
    </div>
  );
}

type ProductSectionPlaceholderProps = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  note: string;
  className?: string;
};

export function ProductSectionPlaceholder({
  id,
  eyebrow,
  title,
  description,
  note,
  className,
}: ProductSectionPlaceholderProps) {
  return (
    <Section id={id} aria-labelledby={`${id}-title`} className={className}>
      <SectionHeading
        id={`${id}-title`}
        eyebrow={eyebrow}
        title={title}
        description={description}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <ProductCardPlaceholder key={index} />
        ))}
      </div>

      <p className="mx-auto mt-6 flex max-w-2xl items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground sm:text-sm">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-deep" />
        <span>{note}</span>
      </p>
    </Section>
  );
}

export function NewArrivalsPlaceholder() {
  return (
    <ProductSectionPlaceholder
      id="new-arrivals"
      eyebrow="أحدث ما وصل المتجر"
      title="وصل حديثًا"
      description="آخر الإضافات إلى تشكيلة أميرة استور."
      note="يعرض هذا القسم المنتجات تلقائيًا حسب تاريخ إضافتها الفعلي (بدون اختيار يدوي) — تُربط بقاعدة البيانات في مرحلة لاحقة من المشروع."
    />
  );
}

export function OffersPlaceholder() {
  return (
    <ProductSectionPlaceholder
      id="offers"
      eyebrow="خصومات حقيقية فقط"
      title="العروض"
      description="منتجات بأسعار مخفّضة لفترة محدودة."
      note="يعرض هذا القسم فقط المنتجات ذات سعر مخفّض فعلي (سعر العرض أقل من السعر الأصلي) — تُربط بقاعدة البيانات في مرحلة لاحقة من المشروع."
      className="bg-surface-subtle/50"
    />
  );
}
