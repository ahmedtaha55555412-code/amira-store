import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { BRAND } from "@/config/brand";
import { getBrandSettings } from "@/lib/branding";
import { siteOrigin } from "@/lib/site-url";

/**
 * Single Arabic production font family (PHASE-01 decision — docs/DESIGN_SYSTEM.md).
 * Loaded weights only: 400 body · 500 UI/labels · 600 shadcn defaults · 700 headings · 800 display.
 *
 * MAINTENANCE FIX (post-PHASE-15 build defect): Cairo is now SELF-HOSTED from the
 * committed variable WOFF2 (src/fonts/cairo/) instead of next/font/google. The Google
 * path performed a mandatory live fetch of fonts.googleapis.com at build time, so any
 * sandbox/CI network outage turned `next build` red (Turbopack "Failed to fetch
 * `Cairo` from Google Fonts" / internal google-font module-not-found). The committed
 * asset is the official Cairo variable font from google/fonts (SIL OFL 1.1 — license
 * alongside the file), covering the full 400–800 weight set plus Arabic + Latin, so
 * the design decision, typography hierarchy, and the --font-arabic CSS variable
 * contract are preserved bit-for-bit with zero build-time network dependency.
 */
const cairo = localFont({
  src: "../fonts/cairo/Cairo-VariableFont.woff2",
  weight: "200 1000",
  style: "normal",
  variable: "--font-arabic",
  display: "swap",
});

const siteUrl = siteOrigin();

export async function generateMetadata(): Promise<Metadata> {
  const { storeName } = await getBrandSettings();
  const description = BRAND.description.replace(BRAND.storeName, storeName);
  const title = `${storeName} | أزياء العائلة ومستحضرات التجميل`;

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: title,
      template: `%s | ${storeName}`,
    },
    description,
    applicationName: storeName,
    keywords: [
      storeName,
      "متجر عائلي",
      "أزياء نسائية",
      "أزياء رجالية",
      "أزياء أطفال",
      "مستحضرات تجميل",
      "مصر",
      "الدفع عند الاستلام",
    ],
    openGraph: {
      type: "website",
      locale: "ar_EG",
      siteName: storeName,
      title,
      description,
      images: [
        {
          url: BRAND.assets.ogImage,
          width: 1200,
          height: 630,
          alt: storeName,
        },
      ],
    },
    robots: { index: true, follow: true },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FBF7F1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${cairo.variable} flex min-h-screen flex-col bg-background font-sans text-foreground antialiased`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
        >
          تخطَّ إلى المحتوى الرئيسي
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
