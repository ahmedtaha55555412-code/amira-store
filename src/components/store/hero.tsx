import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Banknote, MessageCircle } from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
import { Button } from "@/components/ui/button";
import { isExternalCtaHref, sanitizeCtaHref } from "@/lib/cta";
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
 * Hero campaign section. Copy, CTA, and imagery stay connected to the
 * existing PHASE-10 homepage configuration and public-media banner flow.
 */
export function Hero({ copy, banners = [] }: HeroProps) {
  const eyebrow =
    copy?.eyebrow || "نسائية · رجالية · أطفال · مواليد · مستحضرات تجميل";
  const title = copy?.title || "أناقةٌ لكل العائلة من أميرة استور";
  const subtitle =
    copy?.subtitle ||
    "تصفّحي أقسام أميرة استور واكتشفي ما يناسبكِ ولعائلتك.";
  const ctaLabel = copy?.ctaLabel || "استكشف الأقسام";
  const ctaHref = sanitizeCtaHref(copy?.ctaHref, "#categories");
  const isExternalCta = isExternalCtaHref(ctaHref);

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-gradient-to-bl from-background via-surface to-blush/55"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 -start-24 size-72 rounded-full bg-gold/12 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-36 -end-16 size-80 rounded-full bg-blush-deep/20 blur-3xl"
      />

      <Container className="grid items-center gap-7 py-8 sm:gap-9 sm:py-10 lg:grid-cols-2 lg:gap-12 lg:py-12 xl:gap-16 xl:py-14">
        <div className="relative z-10 flex flex-col items-start gap-4 sm:gap-5 lg:gap-6">
          <span className="max-w-full rounded-full border border-gold/45 bg-surface/85 px-3.5 py-1.5 text-xs font-semibold leading-5 text-primary shadow-sm sm:px-4">
            {eyebrow}
          </span>

          <h1
            id="hero-title"
            className="max-w-[15ch] text-balance text-[clamp(1.9rem,7vw,2.8rem)] font-extrabold leading-[1.3] text-foreground sm:text-5xl sm:leading-[1.25] lg:text-[3.25rem] xl:text-[3.6rem]"
          >
            {title}
          </h1>

          <p className="max-w-xl text-[0.9375rem] leading-8 text-muted-foreground sm:text-base sm:leading-8">
            {subtitle}
          </p>

          <div className="flex w-full flex-col items-stretch gap-2.5 pt-1 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
            {isExternalCta ? (
              <Button asChild size="lg" className="min-h-12 rounded-full px-7">
                <a href={ctaHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden className="size-4" />
                  {ctaLabel}
                </a>
              </Button>
            ) : (
              <Button asChild size="lg" className="min-h-12 rounded-full px-7">
                <Link href={ctaHref}>
                  {ctaLabel}
                  <ArrowLeft aria-hidden className="size-4" />
                </Link>
              </Button>
            )}
            <Link
              href="#story"
              className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-primary transition-colors hover:bg-surface/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:justify-start"
            >
              تعرف على قصتنا
            </Link>
          </div>

          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 pt-4 text-xs text-muted-foreground sm:gap-x-6 sm:text-sm">
            <li className="flex items-center gap-2">
              <Banknote aria-hidden className="size-4 shrink-0 text-gold-deep" />
              الدفع عند الاستلام
            </li>
            <li className="flex items-center gap-2">
              <MessageCircle
                aria-hidden
                className="size-4 shrink-0 text-gold-deep"
              />
              تأكيد تكلفة الشحن عبر واتساب
            </li>
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
          <div
            aria-hidden
            className="absolute -inset-3 rounded-[2rem] bg-gold/15 blur-2xl sm:-inset-4 sm:rounded-[2.5rem]"
          />
          {banners.length > 0 ? (
            <div
              role="region"
              aria-label="بانرات الواجهة الرئيسية"
              tabIndex={0}
              className="relative flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-[1.75rem] pb-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:gap-4 sm:rounded-[2.25rem] [scrollbar-width:thin]"
            >
              {banners.map((banner, bannerIndex) => {
                const bannerHref = sanitizeCtaHref(banner.ctaHref, "");
                const externalBannerLink = isExternalCtaHref(bannerHref);

                return (
                  <figure
                    key={banner.id}
                    className="group relative aspect-[5/4] w-full shrink-0 snap-center overflow-hidden rounded-[1.75rem] border border-gold/30 bg-surface shadow-[0_18px_50px_-30px_rgba(77,36,46,0.42)] sm:aspect-[16/10] sm:rounded-[2.25rem] lg:aspect-[1.08]"
                  >
                    <Image
                      src={banner.imageUrl}
                      alt={banner.title}
                      fill
                      sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(100vw - 3rem), (max-width: 1279px) 48vw, 620px"
                      className="object-cover transition-transform duration-700 group-hover:scale-[1.025] motion-reduce:transition-none"
                      loading={bannerIndex === 0 ? "eager" : "lazy"}
                      fetchPriority={bannerIndex === 0 ? "high" : "auto"}
                      decoding={bannerIndex === 0 ? undefined : "async"}
                    />
                    <div
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent"
                    />
                    <figcaption className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-5 text-start text-white sm:p-7">
                      <span className="text-lg font-extrabold leading-snug text-balance sm:text-2xl">
                        {banner.title}
                      </span>
                      {banner.subtitle ? (
                        <span className="max-w-lg text-sm leading-6 text-white/90 sm:text-base">
                          {banner.subtitle}
                        </span>
                      ) : null}
                    </figcaption>
                    {bannerHref ? (
                      <a
                        href={bannerHref}
                        {...(externalBannerLink
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-[-5px] focus-visible:outline-white"
                        aria-label={banner.ctaLabel ?? banner.title}
                      >
                        <span className="sr-only">
                          {banner.ctaLabel ?? banner.title}
                        </span>
                      </a>
                    ) : null}
                  </figure>
                );
              })}
            </div>
          ) : (
            <div
              role="img"
              aria-label="هوية أميرة استور"
              className="relative flex aspect-[5/4] flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-gold/30 bg-gradient-to-br from-surface via-blush/45 to-gold/15 p-6 text-center shadow-[0_18px_50px_-30px_rgba(77,36,46,0.42)] sm:aspect-[16/10] sm:rounded-[2.25rem] sm:p-8 lg:aspect-[1.08]"
            >
              <div
                aria-hidden
                className="absolute inset-4 rounded-[1.25rem] border border-gold/30 sm:inset-6 sm:rounded-[1.75rem]"
              />
              <div
                aria-hidden
                className="absolute -end-14 -top-16 size-44 rounded-full border border-gold/25 sm:size-56"
              />
              <div
                aria-hidden
                className="absolute -bottom-24 -start-16 size-52 rounded-full border border-blush-deep/35 sm:size-64"
              />
              <LogoMark
                className="relative size-24 drop-shadow-sm sm:size-32 lg:size-36"
              />
              <span className="relative mt-4 text-sm font-bold tracking-wide text-primary sm:mt-5 sm:text-base">
                أميرة استور
              </span>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
