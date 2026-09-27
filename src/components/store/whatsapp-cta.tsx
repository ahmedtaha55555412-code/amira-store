import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBrandSettings } from "@/lib/branding";
import { Container } from "./container";

/** Strong WhatsApp CTA band — real handoff to the store number (editable via Admin later). */
export function WhatsAppCta() {
  const settings = getBrandSettings();
  const waHref = `https://wa.me/${settings.whatsappPhone}`;

  return (
    <section aria-labelledby="wa-cta-title" className="pb-16 sm:pb-20 lg:pb-24">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12 sm:py-14">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-12 -start-12 size-44 rounded-full border border-gold/40"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -end-10 size-56 rounded-full border border-gold/30"
          />

          <h2
            id="wa-cta-title"
            className="text-2xl font-extrabold text-balance sm:text-3xl"
          >
            تحتاج مساعدة في الاختيار؟
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-loose text-primary-foreground/90 sm:text-base">
            فريقنا جاهز للرد على استفساراتك ومساعدتك في إتمام طلبك عبر واتساب
            مباشرة.
          </p>

          <div className="mt-7 flex justify-center">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="rounded-full px-8 font-bold"
            >
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`تواصل معنا عبر واتساب على الرقم ${settings.whatsappDisplay} (يفتح في نافذة جديدة)`}
              >
                <MessageCircle aria-hidden className="size-5" />
                تواصل عبر واتساب
              </a>
            </Button>
          </div>

          <p className="mt-4 text-sm text-primary-foreground/80" dir="ltr">
            {settings.whatsappDisplay}
          </p>
        </div>
      </Container>
    </section>
  );
}
