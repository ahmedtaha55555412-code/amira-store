import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { BRAND } from "@/config/brand";

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

const siteUrl = process.env.APP_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${BRAND.storeName} | أزياء العائلة ومستحضرات التجميل`,
    template: `%s | ${BRAND.storeName}`,
  },
  description: BRAND.description,
  applicationName: BRAND.storeName,
  keywords: [
    "أميرة استور",
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
    siteName: BRAND.storeName,
    title: `${BRAND.storeName} | أزياء العائلة ومستحضرات التجميل`,
    description: BRAND.description,
    images: [
      {
        url: BRAND.assets.ogImage,
        width: 1200,
        height: 630,
        alt: BRAND.storeName,
      },
    ],
  },
  robots: { index: true, follow: true },
  // Twitter falls back to the Open Graph tags for title/description/image;
  // declaring the card type once here covers every indexable route.
  twitter: { card: "summary_large_image" },
};

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
