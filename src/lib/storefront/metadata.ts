/**
 * Amira Store — structured product metadata contracts (PHASE-05 tasks 12–13).
 *
 * Two contracts live here:
 *
 * 1. `CartEntryDraft` + `buildCartEntryDraft()` — the explicit selected-variant
 *    contract (task 12): the product page can only "add to cart" once a
 *    concrete variant + quantity are selected, and the payload carrying them
 *    is THIS shape. PHASE-06's cart consumes it unchanged — the purchase panel
 *    builds it today and surfaces it honestly (cart is the next phase).
 *
 * 2. `buildProductJsonLd()` — structured data (task 13, MASTER_PLAN §21):
 *    schema.org Product with an AggregateOffer whose child Offers are the
 *    product's ACTIVE variants (price/availability per variant). PHASE-11
 *    absolutized the structured-data URLs (schema.org identifiers must be
 *    absolute; origin = APP_URL).
 *
 * Prices are the raw server-verified numeric strings — never client-derived.
 */

import type { Metadata } from "next";

import { BRAND } from "@/config/brand";
import { siteOrigin } from "@/lib/site-url";

export type CartEntryDraft = {
  productId: string;
  productSlug: string;
  productName: string;
  variantId: string;
  variantSku: string;
  /** Human-readable explicit selection, e.g. "المقاس: L · اللون: أسود". */
  variantLabel: string;
  quantity: number;
  /** Server-verified current price of the selected variant (numeric string). */
  unitPrice: string;
};

export type CartEntryDraftInput = {
  product: { id: string; slug: string; name: string };
  variant: {
    id: string;
    sku: string;
    currentPrice: string;
    assignments: Array<{ attributeName: string; value: string }>;
  };
  quantity: number;
};

/** Build the explicit variant → cart payload (pure; no I/O). */
export function buildCartEntryDraft(input: CartEntryDraftInput): CartEntryDraft {
  const { product, variant, quantity } = input;
  const safeQuantity = Math.max(1, Math.floor(quantity));
  const variantLabel =
    variant.assignments.length > 0
      ? variant.assignments
          .map((a) => `${a.attributeName}: ${a.value}`)
          .join(' · ')
      : product.name;
  return {
    productId: product.id,
    productSlug: product.slug,
    productName: product.name,
    variantId: variant.id,
    variantSku: variant.sku,
    variantLabel,
    quantity: safeQuantity,
    unitPrice: variant.currentPrice,
  };
}

/* -------------------------------------------------------------------------- */
/* JSON-LD (schema.org) — structured data-ready product metadata               */
/* -------------------------------------------------------------------------- */

export type JsonLdVariantOfferInput = {
  sku: string;
  currentPrice: string;
  stockQuantity: number;
  isActive: boolean;
  label: string | null;
};

export type JsonLdProductInput = {
  name: string;
  description: string | null;
  imageUrl: string | null;
  url: string;
  /** Active variants only — offers must reflect real purchasable state. */
  variants: JsonLdVariantOfferInput[];
};

const OFFERS_MAX = 100;

/** Absolute URL for structured data — schema.org requires absolute identifiers. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteOrigin()}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

/**
 * PHASE-11 static-content-page metadata (about/contact/policies/*): the
 * canonical + OG surface D-5 deferred to this phase. Every page-level
 * openGraph REPLACES the root one, so the brand fallback image is restated
 * here — one place, consistent across all five static routes.
 */
export function staticPageMetadata(input: {
  path: string;
  title: string;
  description: string;
  robots?: { index: boolean; follow: boolean };
}): Metadata {
  return {
    title: input.title,
    description: input.description,
    ...(input.robots ? { robots: input.robots } : {}),
    alternates: { canonical: input.path },
    openGraph: {
      title: input.title,
      description: input.description,
      type: "website",
      locale: "ar_EG",
      url: input.path,
      images: [
        {
          url: BRAND.assets.ogImage,
          width: 1200,
          height: 630,
          alt: BRAND.storeName,
        },
      ],
    },
  };
}

/**
 * HTML-safe JSON-LD serialization (PHASE-13, ISSUE-2026-09-30-065).
 *
 * JSON.stringify does NOT escape `<`/`>`/`&`. Inside a
 * `<script type="application/ld+json">` block, a payload containing
 * `</script>` would terminate the block early and let the remainder render
 * as live markup (stored XSS breakout — proven by the PHASE-13 adversarial
 * suite). Escaping `<`, `>`, `&` and the U+2028/U+2029 line separators as
 * \uXXXX keeps the JSON semantically identical for crawlers while making
 * breakout impossible regardless of the stored content's origin.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** schema.org/Product with per-variant offers (price + availability truth). */
export function buildProductJsonLd(input: JsonLdProductInput): Record<string, unknown> {
  const purchasable = input.variants.filter((v) => v.isActive).slice(0, OFFERS_MAX);
  const prices = purchasable.map((v) => Number(v.currentPrice));
  const availability =
    purchasable.length > 0 && purchasable.some((v) => v.stockQuantity > 0)
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock';

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.imageUrl ? { image: [absoluteUrl(input.imageUrl)] } : {}),
    url: absoluteUrl(input.url),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'EGP',
      lowPrice: prices.length > 0 ? Math.min(...prices) : 0,
      highPrice: prices.length > 0 ? Math.max(...prices) : 0,
      offerCount: purchasable.length,
      availability,
      offers: purchasable.map((v) => ({
        '@type': 'Offer',
        sku: v.sku,
        price: Number(v.currentPrice),
        priceCurrency: 'EGP',
        availability: v.stockQuantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: absoluteUrl(input.url),
        ...(v.label ? { name: v.label } : {}),
      })),
    },
  };
}
