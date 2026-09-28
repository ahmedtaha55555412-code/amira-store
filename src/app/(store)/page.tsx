import { PackageSearch, Percent } from "lucide-react";
import { Hero } from "@/components/store/hero";
import { CategoryShowcase } from "@/components/store/category-showcase";
import { ProductCard } from "@/components/store/product-card";
import { ProductGrid } from "@/components/store/product-grid";
import { Benefits } from "@/components/store/benefits";
import { BrandStory } from "@/components/store/brand-story";
import { SocialProof } from "@/components/store/social-proof";
import { WhatsAppCta } from "@/components/store/whatsapp-cta";
import { Section, SectionHeading } from "@/components/store/section";
import { EmptyState } from "@/components/store/states";
import { ComponentPlayground } from "@/components/store/playground";
import {
  getHomepageReviews,
  getPublishedTestimonials,
} from "@/lib/storefront/reviews";
import { getStorefrontHomepageData } from "@/lib/storefront/catalog";

/**
 * Amira Store homepage: the catalog-facing sections are data-driven —
 * «وصل حديثًا» by real created_at and «العروض» by real variant discounts only
 * (MASTER_PLAN §4; no featured/selected/best-seller logic). The store chrome
 * (announcement/header/footer/FAB) comes from the (store) layout. Social
 * proof (§4 items 9–10) is REAL data since PHASE-09 — approved site reviews
 * and published WhatsApp testimonials, each with an honest empty state.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const { newArrivals, offers } = await getStorefrontHomepageData();
  const [reviews, testimonials] = await Promise.all([
    getHomepageReviews(6),
    getPublishedTestimonials(6),
  ]);

  return (
    <>
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Hero />
        <CategoryShowcase />

        {/* وصل حديثًا — newest active products (real created_at, no manual selection) */}
        <Section id="new-arrivals" aria-labelledby="new-arrivals-title">
          <SectionHeading
            id="new-arrivals-title"
            eyebrow="أحدث ما وصل المتجر"
            title="وصل حديثًا"
            description="آخر الإضافات إلى تشكيلة أميرة استور — مرتبة تلقائيًا حسب تاريخ الإضافة الفعلي."
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

        {/* العروض — products with genuinely discounted variants only (§4/§7) */}
        <Section id="offers" aria-labelledby="offers-title" className="bg-surface-subtle/50">
          <SectionHeading
            id="offers-title"
            eyebrow="خصومات حقيقية فقط"
            title="العروض"
            description="منتجات بسعر مخفّض فعلي — يظهر هنا ما هو أقل من سعره الأصلي فقط."
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

        <Benefits />
        <BrandStory />
        <SocialProof reviews={reviews} testimonials={testimonials} />
        <WhatsAppCta />
      </main>

      {/* QA playground overlay (homepage only, per DESIGN_SYSTEM) */}
      <ComponentPlayground />
    </>
  );
}
