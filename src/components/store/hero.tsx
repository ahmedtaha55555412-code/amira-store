import { ArrowLeft, Banknote, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { isExternalCtaHref } from "@/lib/cta";
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
  copy?: HeroCopy | null;
  banners?: HeroBanner[];
};

export function Hero({ copy, banners = [] }: HeroProps) {
  const eyebrow = copy?.eyebrow || "نسائية · رجالية · أطفال · مواليد · مستحضرات تجميل";
  const title = copy?.title || "أناقة لكل العائلة من أميرة استور";
  const subtitle =
    copy?.subtitle ||
    "تشكيلات مختارة بعناية، وأسعار واضحة، وتجربة تسوق عربية بسيطة تبدأ من اختيارك وتنتهي عند باب منزلك.";
  const ctaLabel = copy?.ctaLabel || "استكشف الأقسام";
  const ctaHref = copy?.ctaHref || "#categories";
  const isExternalCta = isExternalCtaHref(ctaHref);

  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden border-b border-border/50 bg-background"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -top-28 -end-16 size-80 rounded-full border border-gold/20" />
        <div className="absolute -bottom-36 -start-20 size-96 rounded-full border border-blush-deep/30" />
      </div>

      <Container className="relative grid items-center gap-8 py-8 sm:gap-10 sm:py-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:py-14 xl:py-16">
        <div className="flex max-w-2xl flex-col items-start gap-5 lg:gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/35 bg-surface/90 px-4 py-1.5 text-xs font-bold text-primary shadow-sm">
            <Sparkles aria-hidden className="size-3.5 text-gold-deep" />
            {eyebrow}
          </span>

          <h1
            id="hero-title"
            className="max-w-2xl text-[2rem] font-extrabold leading-[1.26] tracking-tight text-balance sm:text-[2.65rem] lg:text-[3.35rem]"
          >
            {title}
          </h1>

          <p className="max-w-xl text-sm leading-loose text-muted-foreground sm:text-base lg:text-[1.05rem]">
            {subtitle}
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild size="lg" className="min-h-12 rounded-full px-7 font-bold shadow-sm">
              {isExternalCta ? (
                <a href={ctaHref} target="_blank" rel="noopener noreferrer">
                  {ctaLabel}
                  <ArrowLeft aria-hidden className="size-4" />
                </a>
              ) : (
                <a href={ctaHref}>
                  {ctaLabel}
                  <ArrowLeft aria-hidden className="size-4" />
                </a>
              )}
            </Button>
            <Button asChild size="lg" variant="outline" className="min-h-12 rounded-full border-border bg-surface/75 px-7">
              <a href="#story">تعرفي على قصتنا</a>
            </Button>
          </div>

          <ul className="grid w-full grid-cols-1 gap-2 pt-1 text-xs text-muted-foreground sm:grid-cols-3 sm:gap-3 sm:text-sm">
            <li className="flex items-center gap-2 rounded-xl border border-border/70 bg-surface/70 px-3 py-2.5">
              <Banknote aria-hidden className="size-4 shrink-0 text-gold-deep" />
              <span>الدفع عند الاستلام</span>
            </li>
            <li className="flex items-center gap-2 rounded-xl border border-border/70 bg-surface/70 px-3 py-2.5">
              <MessageCircle aria-hidden className="size-4 shrink-0 text-gold-deep" />
              <span>تأكيد الشحن عبر واتساب</span>
            </li>
            <li className="flex items-center gap-2 rounded-xl border border-border/70 bg-surface/70 px-3 py-2.5">
              <ShieldCheck aria-hidden className="size-4 shrink-0 text-gold-deep" />
              <span>متابعة الطلب</span>
            </li>
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:justify-self-end">
          <div aria-hidden className="absolute -inset-5 rounded-[2.75rem] bg-blush-deep/20 blur-3xl" />
          {banners.length > 0 ? (
            <div
              role="region"
              aria-label="بانرات الحملات الرئيسية"
              className="relative flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-[2rem] pb-2 [scrollbar-width:thin]"
            >
              {banners.map((banner, index) => (
                <article
                  key={banner.id}
                  className="relative aspect-[5/4] w-full shrink-0 snap-center overflow-hidden rounded-[2rem] border border-gold/30 bg-surface shadow-md sm:aspect-[4/3]"
                >
                  <img
                    src={banner.imageUrl}
                    alt={banner.title}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading={index === 0 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : "auto"}
                    decoding="async"
                  />
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-5 text-white sm:p-6">
                    <h2 className="max-w-lg text-lg font-extrabold text-balance sm:text-xl">{banner.title}</h2>
                    {banner.subtitle ? <p className="max-w-lg text-xs leading-relaxed text-white/85 sm:text-sm">{banner.subtitle}</p> : null}
                    {banner.ctaHref && banner.ctaLabel ? (
                      <a
                        href={banner.ctaHref}
                        {...(isExternalCtaHref(banner.ctaHref)
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-bold text-primary shadow-sm backdrop-blur transition-transform hover:-translate-y-0.5"
                      >
                        {banner.ctaLabel}
                        <ArrowLeft aria-hidden className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-[2rem] border border-gold/30 bg-surface/95 p-6 shadow-md sm:p-8 lg:p-10">
              <div aria-hidden className="absolute -top-24 -end-20 size-56 rounded-full border border-gold/25" />
              <div aria-hidden className="absolute -bottom-28 -start-24 size-72 rounded-full border border-blush-deep/30" />
              <div className="relative flex min-h-[22rem] flex-col items-center justify-center gap-5 text-center sm:min-h-[26rem]">
                <div className="flex size-24 items-center justify-center rounded-[1.75rem] border border-gold/35 bg-blush/50 shadow-sm sm:size-28">
                  <img src="/brand/logo-mark.svg" alt="" className="size-20 sm:size-24" />
                </div>
                <BrandLogo
                  variant="lockup"
                  logoClassName="h-auto w-[12rem] sm:w-[15rem]"
                />
                <p className="max-w-sm text-sm leading-loose text-muted-foreground sm:text-base">
                  مساحة الحملة الرئيسية جاهزة لصورك من لوحة التحكم، بينما تظل هوية أميرة استور واضحة وأنيقة في كل شاشة.
                </p>
                <Badge variant="outline" className="border-gold/50 bg-surface-subtle/70 text-gold-deep">
                  إدارة المحتوى من لوحة التحكم
                </Badge>
              </div>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
