import { AnnouncementBar } from "@/components/store/announcement-bar";
import { StoreHeader } from "@/components/store/store-header";
import { StoreFooter } from "@/components/store/store-footer";
import { Hero } from "@/components/store/hero";
import { CategoryShowcase } from "@/components/store/category-showcase";
import {
  NewArrivalsPlaceholder,
  OffersPlaceholder,
} from "@/components/store/product-sections-placeholder";
import { Benefits } from "@/components/store/benefits";
import { BrandStory } from "@/components/store/brand-story";
import { SocialProofPlaceholder } from "@/components/store/social-proof-placeholder";
import { WhatsAppCta } from "@/components/store/whatsapp-cta";
import { WhatsAppFloatingButton } from "@/components/store/whatsapp-fab";
import { ComponentPlayground } from "@/components/store/playground";

/**
 * Amira Store homepage shell (PHASE-01).
 * Visual skeleton only — data-driven product sections arrive in later phases;
 * every non-functional affordance is clearly labeled as upcoming.
 */
export default function Home() {
  return (
    <>
      <AnnouncementBar />
      <StoreHeader />

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Hero />
        <CategoryShowcase />
        <NewArrivalsPlaceholder />
        <OffersPlaceholder />
        <Benefits />
        <BrandStory />
        <SocialProofPlaceholder />
        <WhatsAppCta />
      </main>

      <StoreFooter />

      {/* Fixed utility overlays (outside the document flow) */}
      <WhatsAppFloatingButton />
      <ComponentPlayground />
    </>
  );
}
