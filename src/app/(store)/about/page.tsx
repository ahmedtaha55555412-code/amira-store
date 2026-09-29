import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/store/container";
import { LogoMark } from "@/components/brand/logo-mark";
import { staticPageMetadata } from "@/lib/storefront/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = staticPageMetadata({
  path: "/about",
  title: "من نحن",
  description:
    "أميرة استور — متجر عائلي عربي للأزياء ومستحضرات التجميل: تشكيلات مختارة بعناية لكل أفراد العائلة، دفع عند الاستلام، وتأكيد تكلفة الشحن عبر واتساب.",
});

const VALUES = ["الجودة أولًا", "أسعار عادلة", "خدمة قريبة"] as const;

/**
 * About page (PHASE-10). Factual store copy only — no invented history,
 * metrics, or claims the store cannot support (MASTER_PLAN §4 item 7).
 */
export default function AboutPage() {
  return (
    <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
      <Container className="py-12 sm:py-16">
        <div className="mx-auto flex max-w-2xl flex-col items-start gap-6">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <LogoMark className="size-12" />
          </span>

          <div>
            <h1 className="text-3xl font-extrabold text-balance sm:text-4xl">
              أميرة استور… حكاية عائلة
            </h1>
            <p className="mt-3 text-sm leading-loose text-muted-foreground sm:text-base">
              بدأت فكرة أميرة استور من سؤال بسيط: لماذا يجد كل فرد في العائلة
              ما يناسبه في مكان واحد؟ من هنا اخترنا تشكيلات تغطي احتياجات النساء
              والرجال والأطفال والمواليد، إلى جانب مستحضرات تجميل مختارة بعناية.
            </p>
          </div>

          <div className="flex flex-col gap-4 text-sm leading-loose text-muted-foreground sm:text-base">
            <p>
              نؤمن أن التسوق الإلكتروني يجب أن يكون واضحًا ومريحًا: أسعار معلنة
              بصراحة، دفع عند الاستلام، واتفاق على تكلفة الشحن معك مباشرة عبر
              واتساب قبل تأكيد طلبك.
            </p>
            <p>
              كل منتج يمر بمراجعة قبل نشره، وتُعرض تفاصيله ومقاساته بوضوح في
              صفحته. وإذا احتجت مساعدة في الاختيار أو الطلب، فريقنا متاح للرد
              عبر واتساب مباشرة.
            </p>
          </div>

          <ul className="flex flex-wrap gap-2" aria-label="قيمنا">
            {VALUES.map((value) => (
              <li
                key={value}
                className="rounded-full border border-gold/40 bg-surface px-4 py-1.5 text-xs font-semibold text-gold-deep"
              >
                {value}
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link href="/">تسوّق الآن</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link href="/contact">تواصل معنا</Link>
            </Button>
          </div>
        </div>
      </Container>
    </main>
  );
}
