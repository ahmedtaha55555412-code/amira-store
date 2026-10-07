import Link from "next/link";
import { Facebook, Instagram, MessageCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getBrandSettings } from "@/lib/branding";
import { SECTION_NAV } from "@/config/navigation";
import { getStorefrontCategoryTree } from "@/lib/storefront/catalog";
import { Container } from "./container";

/** Lucide ships no TikTok brand glyph — minimal inline brand mark (decorative). */
function TikTokIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" focusable="false" fill="currentColor" className={className} {...props}>
      <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

type SocialEntry = {
  key: string;
  href: string;
  label: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

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

  /**
   * PACK-04: every platform the settings contract already accepts
   * (SOCIAL_LINK_KEYS = instagram/facebook/tiktok) renders from the live
   * configured values — a configured URL is never silently dropped, and an
   * unset platform is never rendered (no new platforms, no new fields).
   */
  const socialEntries = (
    [
      { key: "instagram", href: settings.socialLinks.instagram, label: "إنستغرام", Icon: Instagram },
      { key: "facebook", href: settings.socialLinks.facebook, label: "فيسبوك", Icon: Facebook },
      { key: "tiktok", href: settings.socialLinks.tiktok, label: "تيك توك", Icon: TikTokIcon },
    ] as SocialEntry[]
  ).filter((entry) => Boolean(entry.href));

  return (
    <footer className="mt-auto bg-footer text-footer-foreground">
      <Container className="py-12 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="flex flex-col items-start gap-4">
            <BrandLogo
              variant="compact"
              showEnglishWordmark
              className="text-footer-foreground"
              markClassName="h-11 w-11"
              wordmarkClassName="text-lg text-footer-foreground"
              englishWordmarkClassName="text-[0.55rem] text-gold"
            />
            <p className="max-w-xs text-sm leading-loose text-footer-foreground/70">
              {settings.footerText}
            </p>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-footer-foreground/25 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-footer-foreground/10"
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
                    className="inline-block py-2.5 -my-2.5 transition-colors hover:text-footer-foreground"
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
                  className="inline-block py-2.5 -my-2.5 transition-colors hover:text-footer-foreground"
                >
                  من نحن
                </Link>
              </li>
              <li className="text-sm text-footer-foreground/70">
                <Link
                  href="/contact"
                  className="inline-block py-2.5 -my-2.5 transition-colors hover:text-footer-foreground"
                >
                  تواصل معنا
                </Link>
              </li>
              <li className="text-sm text-footer-foreground/70">
                <Link
                  href="/track-order"
                  className="inline-block py-2.5 -my-2.5 transition-colors hover:text-footer-foreground"
                >
                  تتبع الطلب
                </Link>
              </li>
              {SECTION_NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="inline-block py-2.5 -my-2.5 text-sm text-footer-foreground/80 transition-colors hover:text-footer-foreground"
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
                    className="inline-block py-2.5 -my-2.5 transition-colors hover:text-footer-foreground"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-footer-foreground/15 pt-6 text-center text-xs text-footer-foreground/60 sm:flex-row sm:text-start">
          <p>© {year} أميرة استور — جميع الحقوق محفوظة.</p>
          <p>الدفع عند الاستلام · تأكيد تكلفة الشحن عبر واتساب</p>
        </div>
        {/* PACK-02: the fixed WhatsApp FAB (size-12/sm:size-14 + 1rem offset)
            floats over the very bottom of the page on every route — the
            footer reserves bottom space for its footprint (+ safe area) so no
            copyright text or focusable item is ever obscured. */}
        <div
          aria-hidden
          className="pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
        />
      </Container>
    </footer>
  );
}
