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

## Design tokens
Final values are chosen in PHASE_01 after accessibility checks. Suggested semantic tokens:
- `--background`
- `--surface`
- `--surface-subtle`
- `--foreground`
- `--foreground-muted`
- `--primary`
- `--primary-foreground`
- `--accent`
- `--border`
- `--success`
- `--warning`
- `--danger`

Do not hard-code colors repeatedly inside components.

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
