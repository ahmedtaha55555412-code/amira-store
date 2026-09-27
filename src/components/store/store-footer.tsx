import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getBrandSettings } from "@/lib/branding";
import { SECTION_NAV } from "@/config/navigation";
import { getStorefrontCategoryTree } from "@/lib/storefront/catalog";
import { Container } from "./container";

/** Policy pages arrive in a later phase — listed honestly as upcoming, not links. */
const UPCOMING_POLICIES = ["سياسة الخصوصية", "الشروط والأحكام", "سياسة الشحن"];

/** Footer with real department links (PHASE-05) — policies stay honest non-links. */
export async function StoreFooter() {
  const settings = getBrandSettings();
  const tree = await getStorefrontCategoryTree();
  const year = new Date().getFullYear();
  const waHref = `https://wa.me/${settings.whatsappPhone}`;

  return (
    <footer className="mt-auto bg-footer text-footer-foreground">
      <Container className="py-12 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="flex flex-col items-start gap-4">
            <BrandLogo
              className="text-footer-foreground"
              markClassName="h-11 w-11"
            />
            <p className="max-w-xs text-sm leading-loose text-footer-foreground/70">
              متجر عائلي عربي للأزياء ومستحضرات التجميل — تشكيلات مختارة بعناية
              لكل أفراد العائلة، بأسعار عادلة وخدمة قريبة.
            </p>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-footer-foreground/25 px-4 py-2 text-sm font-medium transition-colors hover:bg-footer-foreground/10"
              aria-label={`تواصل معنا عبر واتساب على الرقم ${settings.whatsappDisplay} (يفتح في نافذة جديدة)`}
            >
              <MessageCircle aria-hidden className="size-4" />
              <span dir="ltr">{settings.whatsappDisplay}</span>
            </a>
          </div>

          {/* Categories (real department links from the database) */}
          <nav aria-label="أقسام المتجر">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
              <span aria-hidden className="size-1.5 rounded-full bg-gold" />
              الأقسام
            </h3>
            <ul className="flex flex-col gap-2.5">
              {tree.map((department) => (
                <li key={department.id} className="text-sm text-footer-foreground/70">
                  <Link
                    href={`/category/${encodeURIComponent(department.slug)}`}
                    className="transition-colors hover:text-footer-foreground"
                  >
                    {department.name}
                  </Link>
                </li>
              ))}
              {tree.length === 0 ? (
                <li className="text-sm text-footer-foreground/50">قريبًا</li>
              ) : null}
            </ul>
          </nav>

          {/* Quick links (homepage anchors) */}
          <nav aria-label="روابط سريعة">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
              <span aria-hidden className="size-1.5 rounded-full bg-gold" />
              روابط سريعة
            </h3>
            <ul className="flex flex-col gap-2.5">
              {SECTION_NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-sm text-footer-foreground/80 transition-colors hover:text-footer-foreground"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Policies (upcoming — not links yet) */}
          <div>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
              <span aria-hidden className="size-1.5 rounded-full bg-gold" />
              معلومات وسياسات
            </h3>
            <ul className="flex flex-col gap-2.5">
              {UPCOMING_POLICIES.map((name) => (
                <li
                  key={name}
                  className="flex items-center justify-between gap-2 text-sm text-footer-foreground/70"
                >
                  <span>{name}</span>
                  <span className="rounded-full border border-footer-foreground/25 px-2 py-0.5 text-[10px] text-footer-foreground/60">
                    قريبًا
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-footer-foreground/50">
              تُنشر صفحات السياسات عند اكتمال مرحلة إدارة المحتوى.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-footer-foreground/15 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 text-center text-xs text-footer-foreground/60 sm:flex-row sm:text-start">
          <p>© {year} أميرة استور — جميع الحقوق محفوظة.</p>
          <p>الدفع عند الاستلام · تأكيد تكلفة الشحن عبر واتساب</p>
        </div>
      </Container>
    </footer>
  );
}
