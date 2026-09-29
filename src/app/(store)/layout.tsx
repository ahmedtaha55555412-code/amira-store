import { AnnouncementBar } from "@/components/store/announcement-bar";
import { StoreHeader } from "@/components/store/store-header";
import { StoreFooter } from "@/components/store/store-footer";
import { WhatsAppFloatingButton } from "@/components/store/whatsapp-fab";
import { getBrandSettings } from "@/lib/branding";

/**
 * Storefront shell (PHASE-05 task 1, PHASE-10 branding): announcement bar +
 * sticky header with real category navigation + sticky footer on EVERY
 * storefront route (/, /category/[slug], /product/[slug], /search). The
 * header/footer/announcement are async server components reading live data.
 *
 * PHASE-10 favicon (D-4): when the admin uploaded a favicon (public media
 * only), an override <link> is rendered — React 19 hoists it into <head>
 * AFTER the file-convention default icon, so the custom icon wins while the
 * default stays the safe fallback. Admin surfaces keep the default icon.
 */
export default async function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { faviconUrl } = await getBrandSettings();

  return (
    <>
      {faviconUrl ? <link rel="icon" href={faviconUrl} /> : null}
      <AnnouncementBar />
      <StoreHeader />
      {children}
      <StoreFooter />
      {/* Fixed utility overlay (outside the document flow) */}
      <WhatsAppFloatingButton />
    </>
  );
}
