import { Banknote, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo-mark";
import { Container } from "./container";

export type HeroCopy = {
  eyebrow?: string | null;
  title?: string | null;
  subtitle?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
};

export type HeroBanner = {
  id: string;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imageUrl: string;
};

type HeroProps = {
  /** Admin-curated copy (homepage_sections.hero.config) — falls back to defaults. */
  copy?: HeroCopy | null;
  /** Active admin banners (public media, D-4) — replace the placeholder visual. */
  banners?: HeroBanner[];
};

/**
 * Hero campaign section (PHASE-01 shell → PHASE-10 content-managed).
 * Copy comes from the admin homepage settings with the original brand
 * defaults as fallback; the visual side renders the admin-uploaded banner
 * carousel when banners exist, otherwise the honest labeled placeholder.
 */
export function Hero({ copy, banners = [] }: HeroProps) {
  const eyebrow = copy?.eyebrow || "نسائية · رجالية · أطفال · مواليد · مستحضرات تجميل";
  const title = copy?.title || "أناقةٌ لكل العائلة من أميرة استور";
  const subtitle =
    copy?.subtitle ||
    "تشكيلات مختارة بعناية تجمع بين الجودة والسعر العادل، بتجربة تسوق عربية بسيطة: اطلب بسهولة، ادفع عند الاستلام، وتابع طلبك حتى باب منزلك.";
  const ctaLabel = copy?.ctaLabel || "استكشف الأقسام";
  const ctaHref = copy?.ctaHref || "#categories";

  const isExternalCta = ctaHref.startsWith("https://");
  const CtaIcon = isExternalCta ? MessageCircle : undefined;

  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-gradient-to-bl from-background via-surface to-blush/70"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -start-24 size-72 rounded-full bg-gold/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -end-16 size-80 rounded-full bg-blush-deep/25 blur-3xl"
      />

      <Container className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2 lg:gap-14 lg:py-24">
        {/* Copy (first = right side in RTL) */}
        <div className="flex flex-col items-start gap-6">
          <span className="rounded-full border border-gold/40 bg-surface px-4 py-1.5 text-xs font-semibold text-primary">
            {eyebrow}
          </span>

          <h1
            id="hero-title"
            className="text-3xl font-extrabold leading-[1.3] text-balance sm:text-4xl lg:text-[3.2rem] lg:leading-[1.25]"
          >
            {title}
          </h1>

          <p className="max-w-xl text-sm leading-loose text-muted-foreground sm:text-base sm:leading-loose">
            {subtitle}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {isExternalCta ? (
              <Button asChild size="lg" className="rounded-full px-7">
                <a href={ctaHref} target="_blank" rel="noopener noreferrer">
                  {CtaIcon ? <CtaIcon aria-hidden className="size-4" /> : null}
                  {ctaLabel}
                </a>
              </Button>
            ) : (
              <Button asChild size="lg" className="rounded-full px-7">
                <a href={ctaHref}>{ctaLabel}</a>
              </Button>
            )}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-border bg-surface/60 px-7"
            >
              <a href="#story">تعرف على قصتنا</a>
            </Button>
          </div>

          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-muted-foreground sm:text-sm">
            <li className="flex items-center gap-1.5">
              <Banknote aria-hidden className="size-4 text-gold-deep" />
              الدفع عند الاستلام
            </li>
            <li className="flex items-center gap-1.5">
              <MessageCircle aria-hidden className="size-4 text-gold-deep" />
              تأكيد تكلفة الشحن عبر واتساب
            </li>
          </ul>
        </div>

        {/* Visual: admin banners (public media, D-4) or the honest placeholder */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div
            aria-hidden
            className="absolute -inset-4 rounded-[2.5rem] bg-gold/20 blur-2xl"
          />
          {banners.length > 0 ? (
            <div
              role="region"
              aria-label="بانرات العروض الرئيسية"
              className="relative flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-[2rem] pb-2 [scrollbar-width:thin]"
            >
              {banners.map((banner, bannerIndex) => {
                // PHASE-11 LCP discipline: only the FIRST (initially visible)
                // banner loads eagerly with high priority; the rest of the
                // carousel loads lazily so they cannot compete for bandwidth.
                const media = (
                  <figure className="relative flex h-full w-full flex-col">
                    <img
                      src={banner.imageUrl}
                      alt={banner.title}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading={bannerIndex === 0 ? "eager" : "lazy"}
                      fetchPriority={bannerIndex === 0 ? "high" : "auto"}
                      decoding={bannerIndex === 0 ? undefined : "async"}
                    />
                    <figcaption className="relative mt-auto flex flex-col gap-1 bg-gradient-to-t from-black/65 to-transparent p-5 pt-12 text-start text-white">
                      <span className="text-base font-extrabold text-balance">
                        {banner.title}
                      </span>
                      {banner.subtitle ? (
                        <span className="text-xs leading-relaxed text-white/85">
                          {banner.subtitle}
                        </span>
                      ) : null}
                    </figcaption>
                  </figure>
                );

                return (
                  <div
                    key={banner.id}
                    className="relative aspect-[4/3] w-full shrink-0 snap-center overflow-hidden rounded-[2rem] border border-gold/30 bg-surface shadow-sm sm:w-[calc(100%-1rem)]"
                  >
                    {banner.ctaHref ? (
                      <a
                        href={banner.ctaHref}
                        {...(banner.ctaHref.startsWith("https://")
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="absolute inset-0 z-10 rounded-[2rem] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                        aria-label={banner.ctaLabel ?? banner.title}
                      >
                        <span className="sr-only">
                          {banner.ctaLabel ?? banner.title}
                        </span>
                      </a>
                    ) : null}
                    {media}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="relative flex aspect-[4/3] flex-col items-center justify-center gap-4 overflow-hidden rounded-[2rem] border border-gold/30 bg-surface p-8 text-center shadow-sm">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-10 -end-10 size-36 rounded-full border border-blush-deep/50"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-12 -start-12 size-44 rounded-full border border-gold/40"
              />
              <LogoMark className="size-24 sm:size-28" />
              <p className="text-sm font-bold text-foreground/80">
                مساحة صورة الحملة الرئيسية
              </p>
              <p className="max-w-[17rem] text-xs leading-relaxed text-muted-foreground">
                تُدار هذه المساحة من لوحة التحكم — أضف بانراتك لتظهر هنا فورًا.
              </p>
              <Badge
                variant="outline"
                className="border-gold/50 bg-surface-subtle/60 text-gold-deep"
              >
                إدارة المحتوى
              </Badge>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
