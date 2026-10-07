import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PHASE-11 responsive images: admin-uploaded public media lives on the
  // Vercel Blob public CDN (media_assets.url stores the provider-truth URL),
  // so the next/image pipeline must be allowed to fetch + optimize it.
  // The PRIVATE store is intentionally NOT listed — private originals are
  // only ever delivered through the gated /api/media/[id] route (ISSUE-048
  // contract) and must never enter the public image optimizer or its cache.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
    ],
  },
  // TypeScript is validated on EVERY build — including production deploys —
  // and React Strict Mode helps surface unsafe side effects during development.
  reactStrictMode: true,
  // Dev-only: the dev-tools indicator collides with the store's fixed overlays
  // (WhatsApp FAB / QA playground trigger / RTL header) on phone and desktop
  // viewports, so it is disabled during development. Production is unaffected.
  devIndicators: false,
  // Security headers (PHASE-03 security foundation, MASTER_PLAN §24).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
