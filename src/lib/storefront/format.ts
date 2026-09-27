/**
 * Amira Store — storefront display formatting (PHASE-05).
 *
 * Egypt/EGP, Arabic-only store (MASTER_PLAN §2/§32). Prices are stored as
 * numeric(12,2) strings; display formatting is presentation-only and never
 * feeds back into pricing logic (§7: server-side values are the only source
 * of truth). Latin digits are used for numerals — the standard practice of
 * Egyptian retail sites and consistent with the admin surfaces.
 */

const numberFormat = new Intl.NumberFormat('ar-EG-u-nu-latn', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** "349.00" → "349 ج.م." — "125.50" → "125.5 ج.م." */
export function formatPrice(value: string | number): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return '—';
  return `${numberFormat.format(numeric)} ج.م.`;
}

/** Discount percentage (rounded) — 0 when there is no actual discount. */
export function discountPercent(
  originalPrice: string | number,
  currentPrice: string | number,
): number {
  const original = typeof originalPrice === 'string' ? Number(originalPrice) : originalPrice;
  const current = typeof currentPrice === 'string' ? Number(currentPrice) : currentPrice;
  if (!Number.isFinite(original) || !Number.isFinite(current)) return 0;
  if (original <= 0 || current >= original) return 0;
  return Math.round((1 - current / original) * 100);
}

/** Arabic product count phrase for cart/wishlist surfaces: 1/2/3–10/11+ forms. */
export function cartCountPhrase(count: number): string {
  if (count <= 0) return 'السلة فارغة';
  if (count === 1) return 'منتج واحد';
  if (count === 2) return 'منتجان';
  if (count <= 10) return `${count} منتجات`;
  return `${count} منتجًا`;
}
