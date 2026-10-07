import { PackageSearch, Percent } from "lucide-react";
import type { Metadata } from "next";
import { Hero } from "@/components/store/hero";
import { CategoryShowcase } from "@/components/store/category-showcase";
import { ProductCard } from "@/components/store/product-card";
import { ProductGrid } from "@/components/store/product-grid";
import { Benefits } from "@/components/store/benefits";
import { BrandStory } from "@/components/store/brand-story";
import {
  SiteReviewsSection,
  WhatsAppTestimonialsSection,
} from "@/components/store/social-proof";
import { WhatsAppCta } from "@/components/store/whatsapp-cta";
import { Section, SectionHeading } from "@/components/store/section";
import { EmptyState } from "@/components/store/states";
import { ComponentPlayground } from "@/components/store/playground";
import { BRAND } from "@/config/brand";
import {
  getHomepageReviews,
  getPublishedTestimonials,
} from "@/lib/storefront/reviews";
import { getStorefrontHomepageData } from "@/lib/storefront/catalog";
import {
  getEnabledHomepageSections,
  getActiveHomepageBanners,
} from "@/lib/storefront/homepage";
import { getBrandSettings } from "@/lib/branding";

/**
 * Amira Store homepage — PHASE-10 final integration.
 *
 * The page renders the MANAGED sections in their database order with admin
 * visibility honored; the announcement bar, header, and footer stay in the
 * (store) layout chrome (their own settings-driven contracts). Business
 * rules are preserved exactly:
 *  - «وصل حديثًا» remains created_at-driven (newest first) — no manual picks;
 *  - «العروض» remains variant-discount-driven (currentPrice < originalPrice);
 *  - NO featured/selected/best-seller logic exists anywhere.
 */
export const dynamic = "force-dynamic";

/** PHASE-11: the homepage self-canonicalizes and carries its live brand name. */
export async function generateMetadata(): Promise<Metadata> {
  const { storeName } = await getBrandSettings();
  const description = BRAND.description.replace(BRAND.storeName, storeName);

  return {
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "ar_EG",
      siteName: storeName,
      title: `${storeName} | أزياء العائلة ومستحضرات التجميل`,
      description,
      url: "/",
      images: [{ url: BRAND.assets.ogImage, width: 1200, height: 630, alt: storeName }],
    },
  };
}

type SectionConfig = Record<string, unknown>;

function str(config: SectionConfig, key: string): string | null {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default async function Home() {
  const [sections, banners, { newArrivals, offers }, reviews, testimonials, brand] =
    await Promise.all([
      getEnabledHomepageSections(),
      getActiveHomepageBanners(),
      getStorefrontHomepageData(),
      getHomepageReviews(6),
      getPublishedTestimonials(6),
      getBrandSettings(),
    ]);

  const byKey = new Map<string, (typeof sections)[number]>(
    sections.map((s) => [s.key, s]),
  );
  const ordered = sections.filter((s) => s.key !== "announcement");

  const framing = (key: string) => {
    const section = byKey.get(key);
    return {
      title: section?.title ?? null,
      subtitle: section?.subtitle ?? null,
    };
  };

  const renderSection = (key: string, config: SectionConfig | null) => {
    switch (key) {
      case "hero":
        return (
          <Hero
            key={key}
            copy={{
              eyebrow: str(config ?? {}, "eyebrow"),
              title: str(config ?? {}, "title"),
              subtitle: str(config ?? {}, "subtitle"),
              ctaLabel: str(config ?? {}, "ctaLabel"),
              ctaHref: str(config ?? {}, "ctaHref"),
            }}
            banners={banners}
          />
        );

      case "categories":
        return <CategoryShowcase key={key} framing={framing(key)} />;

      case "new_arrivals":
        return (
          <Section key={key} id="new-arrivals" aria-labelledby="new-arrivals-title">
            <SectionHeading
              id="new-arrivals-title"
              eyebrow="أحدث ما وصل المتجر"
              title={framing(key).title ?? "وصل حديثًا"}
              description={
                framing(key).subtitle ??
                `آخر الإضافات إلى تشكيلة ${brand.storeName} — مرتبة تلقائيًا حسب تاريخ الإضافة الفعلي.`
              }
            />
            {newArrivals.length === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title="لا توجد منتجات منشورة بعد"
                description="تُعرض هنا أحدث المنتجات تلقائيًا فور نشرها من لوحة الإدارة."
              />
            ) : (
              <ProductGrid>
                {newArrivals.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 4} />
                ))}
              </ProductGrid>
            )}
          </Section>
        );

      case "offers":
        return (
          <Section
            key={key}
            id="offers"
            aria-labelledby="offers-title"
            className="bg-surface-subtle/50"
          >
            <SectionHeading
              id="offers-title"
              eyebrow="خصومات حقيقية فقط"
              title={framing(key).title ?? "العروض"}
              description={
                framing(key).subtitle ??
                "منتجات بسعر مخفّض فعلي — يظهر هنا ما هو أقل من سعره الأصلي فقط."
              }
            />
            {offers.length === 0 ? (
              <EmptyState
                icon={Percent}
                title="لا توجد عروض حالية"
                description="تُعرض هنا المنتجات المخفّضة تلقائيًا عند توفر خصم فعلي على أي متغير."
              />
            ) : (
              <ProductGrid>
                {offers.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 2} />
                ))}
              </ProductGrid>
            )}
          </Section>
        );

      case "benefits":
        return (
          <Benefits
            key={key}
            framing={{
              ...framing(key),
              items: (config?.items ?? null) as
                | Array<{ title?: unknown; description?: unknown }>
                | null,
            }}
          />
        );

      case "brand_story":
        return (
          <BrandStory
            key={key}
            framing={{ ...framing(key), body: str(config ?? {}, "body") }}
          />
        );

      case "reviews":
        return <SiteReviewsSection key={key} reviews={reviews} framing={framing(key)} />;

      case "testimonials":
        return (
          <WhatsAppTestimonialsSection
            key={key}
            testimonials={testimonials}
            framing={framing(key)}
          />
        );

      case "whatsapp_cta":
        return (
          <WhatsAppCta
            key={key}
            title={str(config ?? {}, "title")}
            body={str(config ?? {}, "body")}
            ctaLabel={str(config ?? {}, "ctaLabel")}
          />
        );

      default:
        // Unknown/announcement keys never render here (announcement = chrome).
        return null;
    }
  };

  return (
    <>
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {ordered.map((section) =>
          renderSection(section.key, section.config),
        )}
      </main>

      {/* QA playground overlay (homepage only, per DESIGN_SYSTEM) — dev-only
          since PHASE-11: the design-system review tool must not ship its
          client bundle to production customers ("gate or remove before
          launch phases"; NODE_ENV is build-inlined so the chunk is dropped). */}
      {process.env.NODE_ENV === "development" ? <ComponentPlayground /> : null}
    </>
  );
}
