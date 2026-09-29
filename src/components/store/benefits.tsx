import {
  Banknote,
  HeartHandshake,
  MessageCircle,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Section, SectionHeading } from "./section";

type Benefit = {
  icon: LucideIcon;
  title: string;
  description: string;
};

/** Trust/benefits section — factual claims only (supported by the store specification). */
const BENEFITS: Benefit[] = [
  {
    icon: Banknote,
    title: "الدفع عند الاستلام",
    description:
      "ادفع نقدًا عند استلام طلبك — بدون أي دفع إلكتروني أو بطاقات.",
  },
  {
    icon: MessageCircle,
    title: "تأكيد الشحن عبر واتساب",
    description:
      "نتفق معك على تكلفة الشحن عبر واتساب حسب عنوانك قبل التأكيد النهائي للطلب.",
  },
  {
    icon: HeartHandshake,
    title: "تشكيلة لكل العائلة",
    description:
      "منتجات مختارة بعناية للنساء والرجال والأطفال والمواليد ومستحضرات التجميل.",
  },
  {
    icon: ShieldCheck,
    title: "متابعة لطلبك",
    description:
      "تابع حالة طلبك في أي وقت برقم الطلب ورقم الهاتف المستخدم عند الشراء.",
  },
];

export function Benefits({
  framing,
}: {
  /**
   * PHASE-10 admin framing: section title/subtitle + optional item copy.
   * Configured items reuse the curated icon set by position (icons are
   * code-chosen; no arbitrary media enters this section).
   */
  framing?: {
    title?: string | null;
    subtitle?: string | null;
    items?: Array<{ title?: unknown; description?: unknown }> | null;
  } | null;
}) {
  const items: Benefit[] = (() => {
    const configured = framing?.items;
    if (!Array.isArray(configured) || configured.length === 0) return BENEFITS;
    const mapped = configured
      .map((item, index) => ({
        icon: BENEFITS[index % BENEFITS.length]!.icon,
        title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : '',
        description:
          typeof item.description === 'string' && item.description.trim()
            ? item.description.trim()
            : '',
      }))
      .filter((item) => item.title.length > 0) as Benefit[];
    return mapped.length > 0 ? mapped : BENEFITS;
  })();

  return (
    <Section aria-labelledby="benefits-title">
      <SectionHeading
        id="benefits-title"
        eyebrow="لماذا أميرة استور؟"
        title={framing?.title || "تجربة تسوق مطمئنة"}
        description={framing?.subtitle || "كل ما تحتاجه العائلة مع وضوح كامل في الدفع والشحن."}
      />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, description }) => (
          <li key={title}>
            <article className="flex h-full flex-col items-start gap-3 rounded-2xl border bg-surface p-6 shadow-sm">
              <span className="flex size-12 items-center justify-center rounded-full bg-blush text-primary">
                <Icon aria-hidden className="size-6" />
              </span>
              <h3 className="font-bold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </Section>
  );
}
