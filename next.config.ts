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
  // TypeScript is validated on EVERY build — including the Vercel production
  // deploy (the scaffold default `ignoreBuildErrors: true` was removed
  // 2026-09-27: a deploy must never ship type-broken code; CI `typecheck`
  // alone does not gate Vercel deployments). Keep this off.
  reactStrictMode: false,
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
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https://*.public.blob.vercel-storage.com; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
