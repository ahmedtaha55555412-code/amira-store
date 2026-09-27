import { AnnouncementBar } from "@/components/store/announcement-bar";
import { StoreHeader } from "@/components/store/store-header";
import { StoreFooter } from "@/components/store/store-footer";
import { WhatsAppFloatingButton } from "@/components/store/whatsapp-fab";

/**
 * Storefront shell (PHASE-05 task 1): announcement bar + sticky header with
 * real category navigation + sticky footer on EVERY storefront route
 * (/, /category/[slug], /product/[slug], /search). The header/footer are
 * async server components reading the live category tree.
 */
export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AnnouncementBar />
      <StoreHeader />
      {children}
      <StoreFooter />
      {/* Fixed utility overlay (outside the document flow) */}
      <WhatsAppFloatingButton />
    </>
  );
}
