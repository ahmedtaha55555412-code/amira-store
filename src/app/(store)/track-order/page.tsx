import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";

import { Container } from "@/components/store/container";
import { Section } from "@/components/store/section";
import { StoreBreadcrumb } from "@/components/store/breadcrumb";
import { TrackOrderView } from "@/components/store/track-order-view";

export const metadata: Metadata = {
  title: "تتبع الطلب",
  description:
    "تابع حالة طلبك من أميرة استور — أدخل رقم الطلب ورقم الموبايل المستخدم في الشراء لعرض حالة الطلب والشحن وبنود الطلب. بدون حساب.",
  /** PHASE-13: per-session utility surface (order-number + phone gate) —
      never an indexable document, consistent with the utility-route design. */
  robots: { index: false, follow: true },
};

/** The (store) chrome reads live catalog data → per-request rendering. */
export const dynamic = "force-dynamic";

/**
 * Customer order tracking (MASTER_PLAN §14): order number + checkout phone,
 * rate-limited, no existence oracle, timeline from the current
 * order/shipping states.
 */
export default function TrackOrderPage() {
  return (
    <>
      <div className="border-b border-border/70 bg-surface-subtle/40">
        <Container className="py-4">
          <StoreBreadcrumb
            items={[
              { label: "الرئيسية", href: "/" },
              { label: "تتبع الطلب" },
            ]}
          />
        </Container>
      </div>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Section className="py-8 sm:py-12">
          <Container className="flex flex-col gap-8">
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-blush text-primary">
                <PackageSearch aria-hidden className="size-6" />
              </span>
              <h1 className="text-2xl font-bold sm:text-3xl">تتبع طلبك</h1>
              <p className="max-w-xl text-sm leading-loose text-muted-foreground sm:text-base">
                أدخل رقم الطلب (يظهر في صفحة إتمام الطلب) ورقم الموبايل الذي
                استخدمته أثناء الشراء لعرض الحالة الأحدث لطلبك وشحنه.
              </p>
            </div>

            <TrackOrderView />
          </Container>
        </Section>
      </main>
    </>
  );
}
