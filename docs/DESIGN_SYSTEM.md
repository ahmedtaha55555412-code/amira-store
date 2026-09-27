# Design System — Amira Store

## Brand direction
Visual reference: premium, light, warm, photography-led ecommerce.

Do not clone any supplied screenshot. Use the references only for:
- light cream backgrounds
- restrained rose/blush accents
- muted gold details
- soft rounded surfaces
- generous whitespace
- strong imagery
- premium Arabic typography

## Design tokens — FINALIZED IN PHASE_01

The palette ships as CSS custom properties in `src/app/globals.css` (OKLCH, light theme default, `.dark` warm variant maintained for future admin use). Components must consume tokens — never hard-code colors.

Semantic tokens (shadcn-compatible) + brand extensions:

| Token | Value (light) | Usage |
|---|---|---|
| `--background` | ivory `oklch(0.977 0.007 88)` | page base |
| `--surface` | near-white warm `oklch(0.994 0.004 90)` | cards, panels |
| `--surface-subtle` | deeper cream `oklch(0.958 0.012 86)` | alt section bands |
| `--foreground` | warm charcoal `oklch(0.28 0.017 50)` | primary text |
| `--foreground-muted` / `--muted-foreground` | `oklch(0.47 0.018 55)` | secondary text (AA on ivory) |
| `--primary` | burgundy rose `oklch(0.48 0.118 8)` | actions, links, CTA (AA with ivory text) |
| `--primary-strong` | `oklch(0.42 0.11 8)` | hover/active |
| `--blush` / `--secondary` | soft rose `oklch(0.925 0.033 18)` | icon chips, soft surfaces |
| `--blush-deep` | `oklch(0.86 0.055 18)` | scrollbar, selection, hovers |
| `--gold` | muted champagne `oklch(0.8 0.08 85)` | decorative details only |
| `--gold-deep` | `oklch(0.46 0.075 80)` | readable gold text/eyebrows (AA) |
| `--success` / `--warning` / `--destructive` | green/amber/red oklch | status colors |
| `--ring` | rose `oklch(0.55 0.115 10)` | visible focus outlines (2px solid, offset 2) |
| `--footer-bg` / `--footer-fg` | charcoal `oklch(0.26 0.018 50)` on `oklch(0.95 0.01 85)` | footer band |
| `--radius` | `1rem` | soft rounded surfaces (sm/md/lg/xl derive) |

Contrast: primary-on-ivory and ivory-on-primary ≥ 4.5:1; muted text ≥ 4.5:1 (WCAG 2.2 AA targets; full audit re-run in PHASE_11).

## Typography — FINALIZED IN PHASE_01

- Single Arabic production family: **Cairo** (Google Fonts via `next/font`), subsets `arabic + latin`.
- Loaded weights only: **400** body · **500** UI/labels/buttons · **600** shadcn defaults/badges · **700** headings · **800** display.
- Variable: `--font-arabic`; wired as Tailwind `--font-sans`. No other font family may be introduced.
- Arabic typography: `leading-loose`/`relaxed` line heights for body, `text-balance` on headings, native shaping (no forced letter-spacing except decorative Latin).

## Responsive breakpoints (intentional, mobile-first)

| Tailwind | Width | Target |
|---|---|---|
| (base) | < 640 | small phones (375 QA width) |
| `sm` | ≥ 640 | large phones |
| `md` | ≥ 768 | tablets portrait (768 QA width) |
| `lg` | ≥ 1024 | tablets landscape / laptops (desktop nav appears) |
| `xl` | ≥ 1280 | desktops (1440 QA width, `max-w-7xl` container) |

Global overflow protection: `overflow-x: clip` on `html`/`body`, `max-width: 100%` media, scrollable table containers.

## Motion & reduced motion

- Subtle transitions only (color/opacity/translate, ≤ 200ms class utilities).
- `prefers-reduced-motion: reduce` global override in `globals.css` (animation/transition ~0ms, no smooth scroll).

## Brand assets (original, replaceable)

- Default mark: crown + gem above a stylized Arabic alef on a blush tile with muted-gold frame (`public/brand/logo-mark.svg`, PNG/WebP derivatives, `src/app/icon.svg` favicon, `src/app/apple-icon.png`).
- Regeneration script: `scripts/generate-brand-assets.mjs` (`bun scripts/generate-brand-assets.mjs`).
- **Replaceability contract:** components render the logo ONLY through `src/components/brand/brand-logo.tsx`, which resolves `getBrandSettings().logoUrl` (future `store_settings.logo_media_id` via media service) and falls back to the default mark. Asset paths and the WhatsApp number live in `src/config/brand.ts` — never in components.

## Components

Build reusable components before duplicating UI:
- AnnouncementBar
- StoreHeader
- DesktopNav
- MobileNav
- SearchBar
- SearchSuggestions
- CartButton
- WishlistButton
- Hero
- CategoryCard
- ProductCard
- PriceBlock
- DiscountBadge
- VariantSelector
- QuantitySelector
- AddToCartButton
- ProductGallery
- ReviewSummary
- ReviewCard
- WhatsAppTestimonialCard
- SectionHeading
- EmptyState
- LoadingState
- ErrorState
- Pagination/LoadMore as selected
- Footer
- WhatsAppFloatingButton

Admin components are separate but share primitives.

**PHASE_01 status:** `AnnouncementBar`, `StoreHeader` (desktop nav + mobile sheet), `Hero`, `CategoryShowcase`, product-section placeholders, `Benefits`, `BrandStory`, `SocialProofPlaceholder`, `WhatsAppCta`, `WhatsAppFloatingButton`, `SectionHeading`, `Container`, `EmptyState`, `LoadingState`, `ErrorState`, and `BrandLogo` are implemented under `src/components/store/` and `src/components/brand/`; buttons/inputs/cards/badges/dialog/table/toast/skeleton are themed shadcn primitives (`src/components/ui/`).

**PHASE_05 additions:** `StoreHeader` upgraded to real category navigation (async server component) + always-visible mobile search row; `HeaderSearch` (Arabic-aware autocomplete); `ProductCard` (sale/out-of-stock/wishlist states, long-title clamp); `PriceBlock`; `StoreBreadcrumb` (RTL chevrons); `ProductGrid`; `CategoryFilters` (desktop sidebar + mobile sheet, URL-driven); `SortSelect`; `Pagination`; `ProductDetailClient` (gallery with variant-image switching, explicit variant selectors with dynamic availability, quantity, add-to-cart entry contract); `SizeGuideView`; `ProductReviews` (approved-only); homepage product sections now data-driven. All consume the PHASE-01 tokens exclusively; every storefront route is wrapped by `src/app/(store)/layout.tsx` (announcement → sticky header → page → sticky footer → FAB).

## QA playground

`src/components/store/playground.tsx` renders a clearly-labeled internal overlay ("فحص التصميم", bottom-end of `/`) showcasing tokens, typography, buttons, inputs, cards/badges, tables, loading/empty/error states, toasts and dialogs for manual QA. It is a development/QA aid — gate or remove before launch phases.

## Product card requirements
Must handle:
- no image
- one image
- multiple images
- sale vs no sale
- out of stock
- long Arabic product names
- wishlist state
- price ranges only when appropriate; otherwise show the actual selected variant price on product page

## Product page requirements
- image gallery
- title
- rating
- price/original price/discount
- variant selectors
- dynamic availability
- quantity
- add to cart
- wishlist
- description
- optional details
- optional size guide
- reviews
- WhatsApp testimonials when linked

## Responsive rules
Define tested layouts for:
- small phones
- regular phones
- tablets in portrait/landscape
- laptops/desktops
- large screens

Do not allow horizontal page overflow.

## Accessibility
- semantic buttons/links
- input labels
- visible focus
- minimum comfortable touch targets
- text contrast checked
- dialog focus handling
- keyboard navigation
- reduced motion

## UX states
Every data-driven component needs:
- loading/skeleton where asynchronous
- empty state
- error state
- disabled state
- success feedback

Do not leave blank white regions while data is loading.
