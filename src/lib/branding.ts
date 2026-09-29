/**
 * Amira Store — storefront branding resolver (PHASE-01 defaults → PHASE-10
 * settings-driven composition).
 *
 * Components consume brand data through THIS module (PHASE-01 contract) —
 * never hard-coded asset paths, WhatsApp numbers, or store copy. Since
 * PHASE-10 the resolver reads the singleton `store_settings` row and the
 * announcement section (decision D-2), falling back per-field to the
 * compile-time BRAND defaults from `src/config/brand.ts` when the DB value
 * is unset or the row is missing — the storefront never breaks because
 * content is not yet curated.
 *
 * Server-only (reads the database); every consumer is an async server
 * component in the (store) layout or admin shell.
 */

import { cache } from "react";

import { BRAND } from "@/config/brand";
import { getResolvedBrandSettings } from "@/lib/admin/settings";

export type BrandSettings = {
  storeName: string;
  /**
   * Custom logo URL uploaded by the Admin (store_settings.logo_media_id →
   * public media asset, D-4). `null` = use the original default mark.
   */
  logoUrl: string | null;
  /** Digits-only international number for wa.me links. */
  whatsappPhone: string;
  /** Human-readable display form of the WhatsApp number. */
  whatsappDisplay: string;
  /** Announcement bar copy (D-2: section config message → BRAND fallback). */
  announcement: string;
  /** Whether the announcement bar section is enabled (visibility control). */
  announcementEnabled: boolean;
  /** Normalized support phone or null when unset (contact page, D-3). */
  supportPhone: string | null;
  /** Human-readable support phone or null when unset. */
  supportPhoneDisplay: string | null;
  /** Footer closing text (store_settings.footer_text → BRAND fallback). */
  footerText: string;
  /** Curated social links (validated https URLs, code-limited keys). */
  socialLinks: { instagram?: string; facebook?: string; tiktok?: string };
  /** Custom favicon URL (public media, D-4) or null for the built-in icon. */
  faviconUrl: string | null;
};

/** Digits-only → spaced display form "010 190 03677" (Egyptian numbers). */
function displayForm(digits: string): string {
  const national = digits.startsWith('20') ? '0' + digits.slice(2) : digits;
  return national.replace(/(\d{3})(\d{3})(\d{5})/, '$1 $2 $3');
}

const DEFAULT_FOOTER_TEXT =
  'متجر عائلي عربي للأزياء ومستحضرات التجميل — تشكيلات مختارة بعناية لكل أفراد العائلة، بأسعار عادلة وخدمة قريبة.';

/**
 * Read the settings row and compose the full storefront branding contract.
 * Falls back to BRAND defaults per field (never throws when unset).
 * Wrapped in React cache(): one deduped settings read per request render —
 * every storefront consumer (announcement/footer/header/FAB/favicon) shares
 * the same result within a single request.
 */
export const getBrandSettings = cache(async (): Promise<BrandSettings> => {
  let resolved: Awaited<ReturnType<typeof getResolvedBrandSettings>> = null;
  try {
    resolved = await getResolvedBrandSettings();
  } catch {
    // Honest fallback: an unavailable settings read must never take the
    // storefront down — the compile-time defaults render instead.
    resolved = null;
  }

  if (!resolved) {
    return {
      storeName: BRAND.storeName,
      logoUrl: null,
      whatsappPhone: BRAND.whatsapp.waMeDigits,
      whatsappDisplay: BRAND.whatsapp.displayNumber,
      announcement: BRAND.announcement,
      announcementEnabled: true,
      supportPhone: null,
      supportPhoneDisplay: null,
      footerText: DEFAULT_FOOTER_TEXT,
      socialLinks: {},
      faviconUrl: null,
    };
  }

  const digits = resolved.settings.whatsappPhone.replace(/\D+/g, '');
  const supportDigits = resolved.settings.supportPhone
    ? resolved.settings.supportPhone.replace(/\D+/g, '')
    : null;

  return {
    storeName: resolved.settings.storeName || BRAND.storeName,
    logoUrl: resolved.logoUrl,
    whatsappPhone: digits,
    whatsappDisplay: displayForm(digits),
    announcement:
      resolved.announcementMessage ?? BRAND.announcement,
    announcementEnabled: resolved.announcementEnabled,
    supportPhone: supportDigits,
    supportPhoneDisplay: supportDigits ? displayForm(supportDigits) : null,
    footerText: resolved.settings.footerText || DEFAULT_FOOTER_TEXT,
    socialLinks: resolved.socialLinks,
    faviconUrl: resolved.faviconUrl,
  };
});
