import { BRAND } from "@/config/brand";

export type BrandSettings = {
  storeName: string;
  /**
   * Custom logo URL uploaded by the Admin (future: store_settings.logo_media_id
   * resolved through the media service). `null` = use the original default mark.
   */
  logoUrl: string | null;
  /** Digits-only international number for wa.me links. */
  whatsappPhone: string;
  /** Human-readable display form of the WhatsApp number. */
  whatsappDisplay: string;
  announcement: string;
};

/**
 * Branding resolver used by all storefront components.
 *
 * PHASE-01: returns compile-time defaults from `src/config/brand.ts`.
 * Future phase: replace the body with a read of the singleton `store_settings`
 * row (via the settings domain service) and fall back to these defaults when
 * unset — components will not need to change.
 */
export function getBrandSettings(): BrandSettings {
  return {
    storeName: BRAND.storeName,
    logoUrl: null,
    whatsappPhone: BRAND.whatsapp.waMeDigits,
    whatsappDisplay: BRAND.whatsapp.displayNumber,
    announcement: BRAND.announcement,
  };
}
