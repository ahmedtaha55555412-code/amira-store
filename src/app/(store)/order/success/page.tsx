import type { Metadata } from "next";

import { Container } from "@/components/store/container";
import { Section } from "@/components/store/section";
import { OrderSuccessView } from "@/components/store/checkout/order-success-view";

export const metadata: Metadata = {
  title: "تم استلام طلبك",
  description:
    "تم تأكيد طلبك في أميرة استور — أكملية عبر واتساب لإرسال تفاصيل الطلب والاتفاق على الشحن (الدفع عند الاستلام).",
  /** The success payload is per-tab session state; keep crawlers out. */
  robots: { index: false, follow: false },
};

/**
 * The (store) chrome reads live catalog data → per-request rendering (same
 * ISSUE-041 discipline as /cart and /checkout).
 */
export const dynamic = "force-dynamic";

/**
 * Order success (PHASE-07): the committed order's customer-facing summary +
 * the pre-filled WhatsApp handoff with visible copy/open fallbacks. The
 * payload is read from this tab's sessionStorage — no order-existence oracle
 * exists on this page.
 */
export default function OrderSuccessPage() {
  return (
    <Section className="py-8 sm:py-10">
      <Container className="flex flex-col gap-6">
        <OrderSuccessView />
      </Container>
    </Section>
  );
}
