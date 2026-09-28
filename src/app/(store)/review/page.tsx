import type { Metadata } from "next";
import { MessageSquareQuote } from "lucide-react";

import { Container } from "@/components/store/container";
import { Section } from "@/components/store/section";
import { StoreBreadcrumb } from "@/components/store/breadcrumb";
import { ReviewForm } from "@/components/store/review-form";

export const metadata: Metadata = {
  title: "اكتب تقييمًا",
  description:
    "شارك تجربتك مع أميرة استور — قيّم منتجات طلبك المسلَّم من ١ إلى ٥ نجوم مع تعليق وصورة اختيارية. بدون حساب، بالتحقق عبر رقم الطلب ورقم الموبايل.",
  robots: { index: true, follow: true },
};

/** The (store) chrome reads live catalog data → per-request rendering. */
export const dynamic = "force-dynamic";

/**
 * Review entry (PHASE-09): "Customer visits review entry. Enters order
 * number + checkout phone." The flow itself is the client form below; the
 * server page only provides the honest framing (moderation notice) and the
 * entry metadata.
 */
export default function ReviewPage() {
  return (
    <>
      <div className="border-b border-border/70 bg-surface-subtle/40">
        <Container className="py-4">
          <StoreBreadcrumb
            items={[
              { label: "الرئيسية", href: "/" },
              { label: "اكتب تقييمًا" },
            ]}
          />
        </Container>
      </div>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Section className="py-8 sm:py-12">
          <Container className="flex flex-col gap-8">
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-blush text-primary">
                <MessageSquareQuote aria-hidden className="size-6" />
              </span>
              <h1 className="text-2xl font-bold sm:text-3xl">شاركنا تقييمك</h1>
              <p className="max-w-xl text-sm leading-loose text-muted-foreground sm:text-base">
                رأيك الحقيقي يساعد غيرك على الاختيار الصحيح. تُنشر التقييمات بعد
                مراجعتها، وتظهر مرتبطة بعملية شراء فعلية بشارة «مشتري موثّق».
              </p>
            </div>

            <ReviewForm />

            <p className="mx-auto max-w-xl text-center text-xs leading-relaxed text-muted-foreground">
              لديك سؤال عن طلبك؟ راسلنا عبر واتساب وسنساعدك فورًا.
            </p>
          </Container>
        </Section>
      </main>
    </>
  );
}
