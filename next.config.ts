import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
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
        ],
      },
    ];
  },
};

export default nextConfig;
