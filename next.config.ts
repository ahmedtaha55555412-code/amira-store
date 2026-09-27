import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Dev-only: the dev-tools indicator collides with the store's fixed overlays
  // (WhatsApp FAB / QA playground trigger / RTL header) on phone and desktop
  // viewports, so it is disabled during development. Production is unaffected.
  devIndicators: false,
};

export default nextConfig;
