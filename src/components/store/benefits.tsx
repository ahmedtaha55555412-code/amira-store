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

const BENEFITS: Benefit[] = [
  {
    icon: Banknote,
    title: "الدفع عند الاستلام",
    description: "ادفعي نقدًا عند استلام طلبك — بدون دفع إلكتروني.",
  },
  {
    icon: MessageCircle,
    title: "تأكيد الشحن عبر واتساب",
    description: "نتفق معك على تكلفة الشحن حسب عنوانك قبل التأكيد النهائي.",
  },
  {
    icon: HeartHandshake,
    title: "تشكيلة لكل العائلة",
    description: "اختيارات للنساء والرجال والأطفال والمواليد ومستحضرات التجميل.",
  },
  {
    icon: ShieldCheck,
    title: "متابعة واضحة للطلب",
    description: "تابعي حالة طلبك برقم الطلب ورقم الهاتف المستخدم عند الشراء.",
  },
];

export function Benefits({
  framing,
}: {
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
        title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : "",
        description:
          typeof item.description === "string" && item.description.trim() ? item.description.trim() : "",
      }))
      .filter((item) => item.title.length > 0) as Benefit[];
    return mapped.length > 0 ? mapped : BENEFITS;
  })();

  return (
    <Section aria-labelledby="benefits-title" className="bg-background">
      <SectionHeading
        id="benefits-title"
        align="start"
        eyebrow="لماذا أميرة استور؟"
        title={framing?.title || "تجربة تسوق مريحة وواضحة"}
        description={framing?.subtitle || "كل ما يهمك من لحظة الاختيار حتى متابعة الطلب، بدون تعقيد."}
      />

      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, description }) => (
          <li key={title}>
            <article className="flex h-full flex-col gap-3 rounded-3xl border border-border/80 bg-surface p-4 shadow-sm sm:p-5">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-blush text-primary sm:size-13">
                <Icon aria-hidden className="size-6" />
              </span>
              <h3 className="text-sm font-extrabold sm:text-base">{title}</h3>
              <p className="text-[11px] leading-loose text-muted-foreground sm:text-sm">{description}</p>
            </article>
          </li>
        ))}
      </ul>
    </Section>
  );
}
