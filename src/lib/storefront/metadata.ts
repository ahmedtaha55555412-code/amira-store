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
 * 2. `buildProductJsonLd()` — structured-data-ready metadata (task 13,
 *    MASTER_PLAN §21): schema.org Product with an AggregateOffer whose child
 *    Offers are the product's ACTIVE variants (price/availability per variant).
 *    The full SEO surface (canonical/OG/sitemap tuning) lands in PHASE-11.
 *
 * Prices are the raw server-verified numeric strings — never client-derived.
 */

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
    ...(input.imageUrl ? { image: [input.imageUrl] } : {}),
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
        url: input.url,
        ...(v.label ? { name: v.label } : {}),
      })),
    },
  };
}
