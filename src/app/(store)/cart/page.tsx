import type { Metadata } from "next";

import { Container } from "@/components/store/container";
import { CartPageView } from "@/components/store/cart/cart-view";
import { Section } from "@/components/store/section";

/** Route metadata is static Arabic; the cart CONTENT is client-persisted state. */
export const metadata: Metadata = {
  title: "سلة التسوق",
  description:
    "سلة تسوق أميرة استور — منتجاتك محفوظة في متصفحك وتبقى حتى تكتملي الطلب (الدفع عند الاستلام).",
  /** PHASE-11: per-session utility surface — never an indexable document. */
  robots: { index: false, follow: true },
};

/**
 * The (store) chrome (header category nav) reads live catalog data, so this
 * route renders per request like every other storefront page — never at build
 * time (ISSUE-041: a static classification would freeze nav data and make the
 * build depend on a reachable database). loading.tsx streams the shell.
 */
export const dynamic = "force-dynamic";

/**
 * Full cart page (PHASE-06 task 4). Shell renders inside the (store) group so
 * announcement/header/footer/FAB wrap it like every storefront route; the
 * content is the persisted client cart.
 */
export default function CartPage() {
  return (
    /* PHASE-11 a11y: the main landmark (and the skip-link target) is required
       on every storefront route — siblings render it per-page. */
    <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
      <Section className="py-8 sm:py-10">
        <Container className="flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold sm:text-3xl">سلة التسوق</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              راجعي منتجاتك وكمياتها — سلتك محفوظة في متصفحك تلقائيًا.
            </p>
          </header>
          <CartPageView />
        </Container>
      </Section>
    </main>
  );
}
