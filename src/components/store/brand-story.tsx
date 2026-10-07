import { ArrowLeft, Check, Crown } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Section, SectionHeading } from "./section";

const VALUES = ["الجودة أولًا", "أسعار عادلة", "خدمة قريبة"];

export function BrandStory({
  framing,
}: {
  framing?: {
    title?: string | null;
    subtitle?: string | null;
    body?: string | null;
  } | null;
}) {
  return (
    <Section id="story" aria-labelledby="story-title" className="bg-surface-subtle/45">
      <div className="grid items-stretch gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10">
        <div className="relative overflow-hidden rounded-[2rem] border border-gold/30 bg-primary p-6 text-primary-foreground shadow-md sm:p-8 lg:p-10">
          <div aria-hidden className="absolute -top-24 -end-24 size-72 rounded-full border border-gold/25" />
          <div aria-hidden className="absolute -bottom-28 -start-20 size-80 rounded-full border border-white/10" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white/5 px-3 py-1.5 text-xs font-bold text-gold">
                <Crown aria-hidden className="size-3.5" />
                هوية أميرة ستور
              </span>
              <span aria-hidden className="size-2 rounded-full bg-gold" />
            </div>

            <div className="flex flex-col items-center gap-5 py-2 text-center">
              <span className="flex size-24 items-center justify-center rounded-[1.75rem] border border-gold/30 bg-surface shadow-sm sm:size-28">
                <img src="/brand/logo-mark.svg" alt="" className="size-20 sm:size-24" />
              </span>
              <BrandLogo variant="lockup" logoClassName="h-auto w-[13rem] sm:w-[16rem]" />
              <p className="max-w-sm text-sm leading-loose text-primary-foreground/85 sm:text-base">
                «أميرة استور» مساحة تجمع ما تحتاجه العائلة في تجربة تسوق عربية دافئة وواضحة.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-primary-foreground/75 sm:text-xs">
              {VALUES.map((value) => (
                <span key={value} className="rounded-2xl border border-white/10 bg-white/5 px-2 py-2.5">
                  {value}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <SectionHeading
            id="story-title"
            align="start"
            eyebrow="قصتنا"
            title={framing?.title || "أميرة استور… أكثر من مجرد متجر"}
            description={framing?.subtitle || "اختيارات عائلية بعناية، مع تجربة بسيطة وقريبة منك."}
            className="mb-5 sm:mb-6"
          />
          {framing?.body ? (
            <p className="text-sm leading-loose text-muted-foreground sm:text-base">{framing.body}</p>
          ) : (
            <div className="flex flex-col gap-4 text-sm leading-loose text-muted-foreground sm:text-base">
              <p>
                بدأت فكرة أميرة استور من رغبة بسيطة: أن يجد كل فرد في العائلة ما يناسبه في مكان واحد، من الأزياء إلى مستحضرات التجميل.
              </p>
              <p>
                ونؤمن أن التسوق الإلكتروني يجب أن يكون واضحًا ومريحًا: أسعار معلنة بصراحة، دفع عند الاستلام، وتأكيد تكلفة الشحن معك عبر واتساب.
              </p>
            </div>
          )}
          <ul className="mt-6 grid gap-2 sm:grid-cols-3">
            {VALUES.map((value) => (
              <li key={value} className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-3 text-xs font-bold">
                <span className="flex size-6 items-center justify-center rounded-full bg-blush text-primary">
                  <Check aria-hidden className="size-3.5" />
                </span>
                {value}
              </li>
            ))}
          </ul>
          <Link
            href="/about"
            className="mt-6 inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-blush/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            تعرّفي علينا أكثر
            <ArrowLeft aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
    </Section>
  );
}
