import { ArrowLeft, Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBrandSettings } from "@/lib/branding";
import { Container } from "./container";

type WhatsAppCtaProps = {
  title?: string | null;
  body?: string | null;
  ctaLabel?: string | null;
};

export async function WhatsAppCta({ title, body, ctaLabel }: WhatsAppCtaProps) {
  const settings = await getBrandSettings();
  const waHref = `https://wa.me/${settings.whatsappPhone}`;

  return (
    <section aria-labelledby="wa-cta-title" className="pb-10 sm:pb-14 lg:pb-16">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] border border-gold/30 bg-primary px-5 py-8 text-primary-foreground shadow-md sm:px-8 sm:py-10 lg:px-12">
          <div aria-hidden className="absolute -top-24 -end-24 size-72 rounded-full border border-gold/20" />
          <div aria-hidden className="absolute -bottom-32 -start-24 size-80 rounded-full border border-white/10" />

          <div className="relative grid items-center gap-6 lg:grid-cols-[1fr_auto] lg:gap-10">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-gold">
                <MessageCircle aria-hidden className="size-3.5" />
                متواجدون عبر واتساب
              </span>
              <h2 id="wa-cta-title" className="mt-4 text-2xl font-extrabold text-balance sm:text-3xl">
                {title ?? "محتاجة مساعدة في الاختيار؟"}
              </h2>
              <p className="mt-2.5 max-w-2xl text-sm leading-loose text-primary-foreground/85 sm:text-base">
                {body ?? "تواصلي معنا مباشرة للاستفسار، تأكيد تفاصيل الطلب، أو الاتفاق على تكلفة الشحن."}
              </p>
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-primary-foreground/75 sm:text-sm">
                <li className="inline-flex items-center gap-1.5"><Check aria-hidden className="size-3.5 text-gold" /> رد مباشر</li>
                <li className="inline-flex items-center gap-1.5"><Check aria-hidden className="size-3.5 text-gold" /> تأكيد الشحن</li>
                <li className="inline-flex items-center gap-1.5"><Check aria-hidden className="size-3.5 text-gold" /> متابعة الطلب</li>
              </ul>
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              <Button asChild size="lg" variant="secondary" className="min-h-12 rounded-full px-7 font-extrabold shadow-sm">
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`تواصل معنا عبر واتساب على الرقم ${settings.whatsappDisplay} (يفتح في نافذة جديدة)`}
                >
                  {ctaLabel ?? "تواصل عبر واتساب"}
                  <ArrowLeft aria-hidden className="size-4" />
                </a>
              </Button>
              <span dir="ltr" className="text-sm font-semibold text-primary-foreground/75">
                {settings.whatsappDisplay}
              </span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
