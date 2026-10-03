"use client";

/**
 * Storefront route-level error boundary (PACK-03 / UX-04) — the customer-side
 * counterpart of the admin boundary. Branded Arabic honest error state built
 * from the existing design system (ErrorState primitive + tokens + Cairo):
 * retry, home navigation, and the WhatsApp support path. Internal error
 * details are never rendered (only the class name + digest are logged
 * client-side, mirroring the admin boundary discipline).
 */

import { useEffect } from "react";
import Link from "next/link";
import { Home, MessageCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/store/container";
import { ErrorState } from "@/components/store/states";
import { BRAND } from "@/config/brand";

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side telemetry only: error class + digest, never the message
    // payload (server internals must not leak into logs or UI).
    console.error("[storefront-page] render error", error.name, error.digest ?? "");
  }, [error]);

  const waHref = `https://wa.me/${BRAND.whatsapp.waMeDigits}`;

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
      <Container className="py-12 sm:py-16">
        <ErrorState
          title="تعذر عرض هذه الصفحة"
          description="حدث خطأ غير متوقع أثناء تحميل هذا الجزء من المتجر. يمكنك إعادة المحاولة، أو العودة إلى الصفحة الرئيسية — وإذا احتجتِ مساعدة في إتمام طلبك تواصلي معنا عبر واتساب ويسعدنا خدمتك."
          action={
            <div className="mt-2 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center">
              <Button onClick={reset} className="min-h-11 gap-2 rounded-full px-6">
                <RotateCcw aria-hidden className="size-4" />
                إعادة المحاولة
              </Button>
              <Button
                asChild
                variant="outline"
                className="min-h-11 gap-2 rounded-full px-6"
              >
                <Link href="/">
                  <Home aria-hidden className="size-4" />
                  الصفحة الرئيسية
                </Link>
              </Button>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-primary underline-offset-4 transition-colors hover:bg-blush/60 hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label={`تواصلي معنا عبر واتساب على الرقم ${BRAND.whatsapp.displayNumber} (يفتح في نافذة جديدة)`}
              >
                <MessageCircle aria-hidden className="size-4" />
                دعم واتساب
              </a>
            </div>
          }
        />
      </Container>
    </main>
  );
}
