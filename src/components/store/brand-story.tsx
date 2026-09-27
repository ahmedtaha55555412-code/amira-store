import { LogoMark } from "@/components/brand/logo-mark";
import { Section, SectionHeading } from "./section";

const VALUES = ["الجودة أولًا", "أسعار عادلة", "خدمة قريبة"];

/** Brand story section (PHASE-01 shell) — original brand copy, no invented metrics. */
export function BrandStory() {
  return (
    <Section id="story" aria-labelledby="story-title">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        {/* Visual panel (right side in RTL) */}
        <div className="relative order-last lg:order-first">
          <div
            aria-hidden
            className="absolute -inset-3 rounded-[2.5rem] bg-blush-deep/30 blur-2xl"
          />
          <div className="relative flex flex-col items-center gap-5 overflow-hidden rounded-[2rem] bg-primary p-8 text-center text-primary-foreground shadow-sm sm:p-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-8 -start-8 size-32 rounded-full border border-gold/40"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-10 -end-10 size-40 rounded-full border border-gold/30"
            />
            <span className="flex size-20 items-center justify-center rounded-full bg-surface shadow-sm">
              <LogoMark className="size-16" />
            </span>
            <p className="max-w-xs text-lg font-bold leading-loose text-balance">
              «أميرة استور… تفاصيل صغيرة تصنع فرقًا كبيرًا في يوم عائلتك.»
            </p>
            <span
              aria-hidden
              className="flex items-center gap-1.5 text-gold"
            >
              <span className="size-1.5 rounded-full bg-gold" />
              <span className="size-1.5 rounded-full bg-gold/70" />
              <span className="size-1.5 rounded-full bg-gold/40" />
            </span>
          </div>
        </div>

        {/* Copy (left side in RTL) */}
        <div>
          <SectionHeading
            id="story-title"
            align="start"
            eyebrow="قصتنا"
            title="أميرة استور… حكاية عائلة"
            description=""
            className="mb-5 sm:mb-6"
          />
          <div className="flex flex-col gap-4 text-sm leading-loose text-muted-foreground sm:text-base">
            <p>
              بدأت فكرة أميرة استور من سؤال بسيط: لماذا يجد كل فرد في العائلة
              ما يناسبه في مكان واحد؟ من هنا اخترنا تشكيلات تغطي احتياجات
              النساء والرجال والأطفال والمواليد، إلى جانب مستحضرات تجميل مختارة
              بعناية.
            </p>
            <p>
              نؤمن أن التسوق الإلكتروني يجب أن يكون واضحًا ومريحًا: أسعار
              معلنة بصراحة، دفع عند الاستلام، واتفاق على تكلفة الشحن معك مباشرة
              عبر واتساب قبل تأكيد طلبك.
            </p>
          </div>
          <ul className="mt-6 flex flex-wrap gap-2">
            {VALUES.map((value) => (
              <li
                key={value}
                className="rounded-full border border-gold/40 bg-surface px-4 py-1.5 text-xs font-semibold text-gold-deep"
              >
                {value}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
