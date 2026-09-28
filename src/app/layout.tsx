import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { BRAND } from "@/config/brand";

/**
 * Single Arabic production font family (PHASE-01 decision — docs/DESIGN_SYSTEM.md).
 * Loaded weights only: 400 body · 500 UI/labels · 600 shadcn defaults · 700 headings · 800 display.
 */
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
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
