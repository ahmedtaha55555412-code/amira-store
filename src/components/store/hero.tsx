import { Banknote, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo-mark";
import { Container } from "./container";

/**
 * Hero placeholder (PHASE-01 shell) — original Amira Store branding.
 * The campaign imagery slot is an honest, labeled placeholder managed by the
 * Admin later; no fake photography is shown.
 */
export function Hero() {
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
            نسائية · رجالية · أطفال · مواليد · مستحضرات تجميل
          </span>

          <h1
            id="hero-title"
            className="text-3xl font-extrabold leading-[1.3] text-balance sm:text-4xl lg:text-[3.2rem] lg:leading-[1.25]"
          >
            أناقةٌ لكل العائلة من{" "}
            <span className="text-primary">أميرة استور</span>
          </h1>

          <p className="max-w-xl text-sm leading-loose text-muted-foreground sm:text-base sm:leading-loose">
            تشكيلات مختارة بعناية تجمع بين الجودة والسعر العادل، بتجربة تسوق
            عربية بسيطة: اطلب بسهولة، ادفع عند الاستلام، وتابع طلبك حتى باب
            منزلك.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-full px-7">
              <a href="#categories">استكشف الأقسام</a>
            </Button>
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

        {/* Visual placeholder (left side in RTL) */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div
            aria-hidden
            className="absolute -inset-4 rounded-[2.5rem] bg-gold/20 blur-2xl"
          />
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
              تُستبدل هذه المساحة بصور حقيقية عالية الجودة يديرها صاحب المتجر من
              لوحة التحكم في مرحلة لاحقة.
            </p>
            <Badge
              variant="outline"
              className="border-gold/50 bg-surface-subtle/60 text-gold-deep"
            >
              قريبًا — إدارة المحتوى
            </Badge>
          </div>
        </div>
      </Container>
    </section>
  );
}
