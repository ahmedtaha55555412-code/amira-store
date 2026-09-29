import type { MetadataRoute } from "next";

import { getSitemapEntries } from "@/lib/storefront/catalog";

/**
 * PHASE-11 sitemap — generated from REAL indexable resources only.
 *
 * - Static content routes that actually exist and are meant to be indexed.
 * - Every reachable active category (full active ancestor chain) and every
 *   active product in a reachable branch — exactly the URLs the storefront
 *   serves (see getSitemapEntries for the reachability contract).
 * - Utility/private surfaces (search, cart, checkout, order, review, admin,
 *   api) are intentionally absent AND disallowed via app/robots.ts.
 * - No hard-coded fake products/categories; per-request generation keeps it
 *   aligned with the live catalog (storefront renders per request anyway).
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");

  const [{ categories, products }] = await Promise.all([getSitemapEntries()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/policies/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/policies/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/policies/shipping`, changeFrequency: "yearly", priority: 0.3 },
  ];

  return [
    ...staticRoutes,
    ...categories.map((entry) => ({
      url: `${siteUrl}${entry.path}`,
      lastModified: entry.updatedAt ?? undefined,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...products.map((entry) => ({
      url: `${siteUrl}${entry.path}`,
      lastModified: entry.updatedAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
