import Link from "next/link";
import { Facebook, Instagram, MessageCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getBrandSettings } from "@/lib/branding";
import { SECTION_NAV } from "@/config/navigation";
import { getStorefrontCategoryTree } from "@/lib/storefront/catalog";
import { Container } from "./container";

/**
 * Policy pages (PHASE-10): neutral factual drafts — owner legal review is
 * required before launch (documented in EXECUTION_STATUS.md).
 */
const POLICY_LINKS = [
  { href: "/policies/privacy", label: "سياسة الخصوصية" },
  { href: "/policies/terms", label: "الشروط والأحكام" },
  { href: "/policies/shipping", label: "سياسة الشحن" },
] as const;

/**
 * Footer with real department links + settings-driven branding (PHASE-10):
 * footer text, social links, and policy links are live data — the store can
 * be maintained without code changes.
 */
export async function StoreFooter() {
  const settings = await getBrandSettings();
  const tree = await getStorefrontCategoryTree();
  const year = new Date().getFullYear();
  const waHref = `https://wa.me/${settings.whatsappPhone}`;

  const socialEntries = [
    { key: "instagram", href: settings.socialLinks.instagram, label: "إنستغرام", Icon: Instagram },
    { key: "facebook", href: settings.socialLinks.facebook, label: "فيسبوك", Icon: Facebook },
  ].filter((s): s is { key: string; href: string; label: string; Icon: typeof Instagram } =>
    Boolean(s.href),
  );

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
              {settings.footerText}
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
            {socialEntries.length > 0 ? (
              <div className="flex items-center gap-2">
                {socialEntries.map(({ key, href, label, Icon }) => (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`تابعنا على ${label} (يفتح في نافذة جديدة)`}
                    className="flex size-10 items-center justify-center rounded-full border border-footer-foreground/25 transition-colors hover:bg-footer-foreground/10"
                  >
                    <Icon aria-hidden className="size-4" />
                  </a>
                ))}
              </div>
            ) : null}
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

          {/* Quick links (store pages + homepage anchors) */}
          <nav aria-label="روابط سريعة">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
              <span aria-hidden className="size-1.5 rounded-full bg-gold" />
              روابط سريعة
            </h3>
            <ul className="flex flex-col gap-2.5">
              <li className="text-sm text-footer-foreground/70">
                <Link
                  href="/about"
                  className="transition-colors hover:text-footer-foreground"
                >
                  من نحن
                </Link>
              </li>
              <li className="text-sm text-footer-foreground/70">
                <Link
                  href="/contact"
                  className="transition-colors hover:text-footer-foreground"
                >
                  تواصل معنا
                </Link>
              </li>
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

          {/* Policies (live pages since PHASE-10) */}
          <div>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
              <span aria-hidden className="size-1.5 rounded-full bg-gold" />
              معلومات وسياسات
            </h3>
            <ul className="flex flex-col gap-2.5">
              {POLICY_LINKS.map(({ href, label }) => (
                <li key={href} className="text-sm text-footer-foreground/70">
                  <Link
                    href={href}
                    className="transition-colors hover:text-footer-foreground"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-footer-foreground/15 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-6 text-center text-xs text-footer-foreground/60 sm:flex-row sm:text-start">
          <p>© {year} أميرة استور — جميع الحقوق محفوظة.</p>
          <p>الدفع عند الاستلام · تأكيد تكلفة الشحن عبر واتساب</p>
        </div>
      </Container>
    </footer>
  );
}
