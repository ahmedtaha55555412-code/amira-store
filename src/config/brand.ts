/**
 * Single source of truth for Amira Store brand defaults (PHASE-01).
 *
 * Rules:
 * - Components must consume brand data via `getBrandSettings()` (src/lib/branding.ts)
 *   or props — never hard-code asset paths, the WhatsApp number, or store copy.
 * - These defaults are replaceable: a later admin phase (store_settings) overrides
 *   them at runtime without code edits (MASTER_PLAN §5 — logo manageable from Admin).
 */
export const BRAND = {
  storeName: "أميرة استور",
  storeNameLatin: "Amira Store",
  tagline: "تشكيلة عائلية مختارة بعناية",
  description:
    "أميرة استور — متجر عائلي عربي للأزياء ومستحضرات التجميل: تشكيلات مختارة بعناية للنساء والرجال والأطفال والمواليد، مع الدفع عند الاستلام وتأكيد تكلفة الشحن عبر واتساب.",
  locale: "ar-EG",
  currency: "EGP",
  whatsapp: {
    /** Owner-approved default (MASTER_PLAN §32); editable from Admin Settings later. */
    phoneIntl: "+201019003677",
    /** Digits only — used to build https://wa.me/<digits> links. */
    waMeDigits: "201019003677",
    displayNumber: "010 190 03677",
  },
  assets: {
    logoMarkSvg: "/brand/logo-mark.svg",
    logoLockupSvg: "/brand/logo-lockup.svg",
    logoMarkPng: "/brand/logo-mark-512.png",
    logoMarkWebp: "/brand/logo-mark-512.webp",
    ogImage: "/brand/og-default.png",
  },
  /** Announcement bar default copy — managed from Admin in a later phase. */
  announcement:
    "الدفع عند الاستلام متاح لجميع الطلبات · تُحدَّد تكلفة الشحن عبر واتساب حسب عنوانك",
} as const;

export type BrandConfig = typeof BRAND;
