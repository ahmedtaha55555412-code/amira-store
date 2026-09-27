export type NavLink = {
  href: string;
  label: string;
};

/**
 * Storefront navigation for the PHASE-01 homepage shell.
 * All links point to real sections of the homepage ("/") so that no broken
 * links exist before catalog routes are introduced in later phases.
 */
export const SECTION_NAV: NavLink[] = [
  { href: "/#categories", label: "الأقسام" },
  { href: "/#new-arrivals", label: "وصل حديثًا" },
  { href: "/#offers", label: "العروض" },
  { href: "/#story", label: "قصتنا" },
  { href: "/#reviews", label: "آراء العملاء" },
];
