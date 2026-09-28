import type { Metadata } from "next";

import { Container } from "@/components/store/container";
import { Section } from "@/components/store/section";
import { CheckoutView } from "@/components/store/checkout/checkout-view";

/** Route metadata is static Arabic; the checkout CONTENT is client cart state. */
export const metadata: Metadata = {
  title: "إتمام الطلب",
  description:
    "إتمام الطلب في أميرة استور — الاسم ورقم الموبايل والعنوان، الدفع عند الاستلام، وتُتفق تكلفة الشحن عبر واتساب.",
};

/**
 * The (store) chrome (header category nav) reads live catalog data, so this
 * route renders per request like every other storefront page — never at build
 * time (ISSUE-041 discipline: no static classification for chrome-driven
 * routes). loading.tsx streams the shell.
 */
export const dynamic = "force-dynamic";

/**
 * Checkout page (PHASE-07): name/phone/address + optional note, Cash on
 * Delivery only, one transactional order-creation call with an idempotency
 * key, then the WhatsApp handoff on the success page.
 */
export default function CheckoutPage() {
  return (
    <Section className="py-8 sm:py-10">
      <Container className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold sm:text-3xl">إتمام الطلب</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            أكملي بياناتك وسنؤكد طلبك عبر واتساب — الدفع عند الاستلام.
          </p>
        </header>
        <CheckoutView />
      </Container>
    </Section>
  );
}
