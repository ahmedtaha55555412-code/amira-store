/**
 * Amira Store — server-side pricing validation (PHASE-04 tasks 13 & 14).
 *
 * MASTER_PLAN §7: the variant is the source of truth for sale pricing, and
 * "client-submitted price values are ignored." Concretely for PHASE-04:
 * prices arrive from the admin editor as strings, are validated here
 * (server-side), normalized to exact scale-2 decimal strings, and stored in
 * numeric(12,2) columns. Nothing is ever derived from client-side totals —
 * there are no client totals at all in this phase.
 */

export class PricingValidationError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'PricingValidationError';
  }
}

/** numeric(12,2) bounds: up to 9,999,999,999.99 EGP. */
const MAX_PRICE = 9_999_999_999.99;

const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Parse + validate one price value.
 * Accepts "350", "350.5", "350.50"; rejects negative/zero/3-decimals/NaN.
 * Returns the canonical scale-2 string the DB column expects.
 */
export function parsePrice(
  raw: unknown,
  label: string,
): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new PricingValidationError(`${label}: قيمة السعر غير صالحة.`);
  }
  const text = typeof raw === 'number' ? raw.toString() : raw.trim();
  if (!MONEY_RE.test(text)) {
    throw new PricingValidationError(
      `${label}: أدخل مبلغًا صحيحًا موجبًا بمنزلتين عشريتين كحد أقصى.`,
    );
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) {
    throw new PricingValidationError(`${label}: يجب أن يكون السعر أكبر من صفر.`);
  }
  if (value > MAX_PRICE) {
    throw new PricingValidationError(`${label}: السعر يتجاوز الحد الأقصى المسموح.`);
  }
  return value.toFixed(2);
}

/**
 * Validate a variant pricing pair. Discount semantics derive from comparison
 * (MASTER_PLAN §7 displays a discount only when current < original) — both
 * directions of the comparison are accepted; the storefront derives meaning.
 */
export function parseVariantPricing(input: {
  originalPrice: unknown;
  currentPrice: unknown;
}): { originalPrice: string; currentPrice: string } {
  const originalPrice = parsePrice(input.originalPrice, 'السعر الأصلي');
  const currentPrice = parsePrice(input.currentPrice, 'السعر الحالي');
  return { originalPrice, currentPrice };
}
