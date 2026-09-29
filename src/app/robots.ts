import type { MetadataRoute } from "next";

/**
 * PHASE-11 robots — the canonical crawling contract for the ACTUAL site.
 *
 * Indexable: / , /about , /contact , /policies/* , /category/* , /product/*
 * Kept out of indexing: admin surfaces, all APIs, and every utility/private
 * or per-session route (cart, checkout, order success, review form, search
 * results). Filtered category views remain crawlable but self-canonicalize
 * to the clean category URL (per-route canonical metadata), so combinatorial
 * filter/query URLs cannot become duplicate indexable documents.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/cart",
          "/checkout",
          "/order/",
          "/review",
          "/search",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
