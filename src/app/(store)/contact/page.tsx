import type { Metadata } from "next";
import { Clock, MessageCircle, Phone } from "lucide-react";

import { getBrandSettings } from "@/lib/branding";
import { Container } from "@/components/store/container";

export const dynamic = "force-dynamic";

/** Minimal Arabic metadata only — canonical/OG tuning is PHASE-11 (D-5). */
export const metadata: Metadata = {
  title: "تواصل معنا",
  description:
    "تواصل مع فريق أميرة استور عبر واتساب للاستفسار عن المنتجات أو متابعة طلبك — الدفع عند الاستلام وتأكيد تكلفة الشحن عبر واتساب.",
  robots: { index: true, follow: true },
};

/**
 * Contact page (PHASE-10, decision D-3): WhatsApp deep link + the optional
 * support phone from store settings + store-controlled content. NO messaging
 * backend is created — the page opens the customer's own WhatsApp client.
 */
export default async function ContactPage() {
  const settings = await getBrandSettings();
  const waHref = `https://wa.me/${settings.whatsappPhone}`;

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
      <Container className="py-12 sm:py-16">
        <div className="mx-auto flex max-w-2xl flex-col gap-8">
          <div>
            <h1 className="text-3xl font-extrabold text-balance sm:text-4xl">
              تواصل معنا
            </h1>
            <p className="mt-3 text-sm leading-loose text-muted-foreground sm:text-base">
              نحن هنا للإجابة على استفساراتك حول المنتجات، المقاسات، أو حالة
              طلبك. أسرع طريقة للوصول إلينا هي واتساب.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* WhatsApp — the primary channel */}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-3 rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40"
              aria-label={`تواصل معنا عبر واتساب على الرقم ${settings.whatsappDisplay} (يفتح في نافذة جديدة)`}
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <MessageCircle aria-hidden className="size-6" />
              </span>
              <h2 className="text-base font-bold">واتساب</h2>
              <p className="text-sm leading-loose text-muted-foreground">
                للاستفسارات والطلبات وتأكيد تكلفة الشحن.
              </p>
              <p className="text-sm font-bold text-primary" dir="ltr">
                {settings.whatsappDisplay}
              </p>
            </a>

            {/* Support phone — only when the admin configured one (D-3) */}
            {settings.supportPhoneDisplay ? (
              <div className="flex flex-col gap-3 rounded-2xl border bg-card p-6">
                <span className="flex size-12 items-center justify-center rounded-full bg-blush text-primary">
                  <Phone aria-hidden className="size-6" />
                </span>
                <h2 className="text-base font-bold">اتصال هاتفي</h2>
                <p className="text-sm leading-loose text-muted-foreground">
                  متاح للرد على استفساراتك مباشرة.
                </p>
                <p className="text-sm font-bold text-primary" dir="ltr">
                  {settings.supportPhoneDisplay}
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-6 sm:col-span-2">
              <span className="flex size-12 items-center justify-center rounded-full bg-surface-subtle text-foreground">
                <Clock aria-hidden className="size-6" />
              </span>
              <h2 className="text-base font-bold">معلومات مهمة</h2>
              <ul className="flex flex-col gap-2 text-sm leading-loose text-muted-foreground">
                <li>
                  الدفع عند الاستلام لجميع الطلبات — لا نطلب أي بيانات بطاقة أو
                  دفع إلكتروني مسبق.
                </li>
                <li>
                  تُحدَّد تكلفة الشحن حسب عنوانك وتُتفق عليها معك عبر واتساب
                  قبل تأكيد الطلب.
                </li>
                <li>
                  يمكنك متابعة تفاصيل طلبك عبر صفحة تأكيد الطلب أو مراسلتنا
                  برقم الطلب على واتساب.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
