# أميرة استور — Master Execution Plan

## 0. Purpose
This document is the binding product and engineering specification for building Amira Store as a production-ready Arabic RTL e-commerce web application for Egypt. It is designed for execution by an AI coding agent in small gated phases.

The visual references supplied by the owner are reference material for aesthetic direction only. They are NOT the source of business rules and must not cause the agent to invent features that are absent from this plan.

## 1. Product vision
Create a premium, modern, family-oriented ecommerce experience named **أميرة استور**, visually attractive on mobile, tablet, and desktop, with a light elegant palette and strong photography. The storefront should feel like a real retail brand, not a generic template.

The project is an actual storefront, not just a landing page. The homepage is landing-page-oriented, but the complete system includes catalog, product variants, cart, checkout, orders, inventory, WhatsApp handoff, order tracking, reviews, and an admin dashboard.

## 2. Fixed business scope
### Included
- Arabic-only customer storefront, RTL.
- Egypt market, EGP currency.
- Categories: women's, men's, children's, baby/infant, cosmetics.
- Simple hierarchical categories.
- Generic Product + Attribute + Variant architecture.
- Variant-level price, stock, SKU, and images.
- Multiple cart items and multiple variants of the same product.
- Guest wishlist stored locally in the browser.
- Guest checkout.
- Customer name, phone, simple address textarea, optional notes.
- Cash on Delivery only.
- Order creation before WhatsApp handoff.
- Immediate inventory decrement at successful order creation.
- Shipping fee determined manually through WhatsApp; recorded later by Admin.
- Admin order management and editing.
- Order tracking by order number + checkout phone.
- Product reviews and WhatsApp testimonial screenshots.
- Editable WhatsApp number and editable WhatsApp message template.
- Editable logo/branding assets.
- SEO, accessibility, responsive design, performance, security, CI/CD.
- GitHub + Neon + Vercel deployment readiness.

### Explicitly excluded
- Customer accounts/login/register.
- Customer password/reset/email account.
- Online payment gateway or card payments.
- Multiple vendors/sellers.
- Brands.
- Coupons/promo codes.
- Returns/exchanges workflow module.
- Best sellers.
- Featured/selected products.
- Rule-based recommendations.
- Mandatory newsletter platform.
- Multiple admin accounts/roles.

## 3. Storefront information architecture
Routes planned:
- `/` Home
- `/category/[slug]` Category listing
- `/product/[slug]` Product details
- `/search` Search results
- `/cart` Cart
- `/checkout` Checkout
- `/order/success` Order success
- `/track-order` Track order
- `/review` Write a review (PHASE-09 review entry: order number + checkout phone verification → delivered-item reviews; documented per §3's route-map refinement rule)
- `/about` About
- `/contact` Contact
- `/policies/privacy` Privacy
- `/policies/terms` Terms
- `/policies/shipping` Shipping
- `/policies/legal` Store legal/policy page as applicable
- `/admin/login` Admin login
- `/admin` Admin dashboard
- `/admin/products` Products
- `/admin/products/new` Create product
- `/admin/products/[id]` Edit product
- `/admin/categories` Categories
- `/admin/orders` Orders
- `/admin/orders/[id]` Order detail/edit
- `/admin/inventory` Inventory
- `/admin/reviews` Reviews
- `/admin/testimonials` WhatsApp testimonials
- `/admin/media` Media
- `/admin/homepage` Homepage content
- `/admin/settings` Settings
- `/admin/settings/security` Change password

The exact final route map may be refined during Phase 1, but any changes must be documented and approved by updating this plan before later implementation phases.

## 4. Homepage specification
Order and behavior:
1. Announcement/promotion bar.
2. Header with Arabic navigation, search, wishlist where appropriate, cart, mobile menu.
3. Hero campaign section with original Amira Store branding and strong imagery.
4. Category showcase for five primary departments.
5. **وصل حديثًا** driven by `products.created_at`, sorted newest first. No manual selection.
6. **العروض** driven by variants where `currentPrice < originalPrice`.
7. Benefits/trust section using only factual claims that the store can support.
8. Brand story/about section.
9. Product reviews section from approved on-site reviews.
10. WhatsApp customer testimonial section from admin-uploaded screenshots.
11. Strong WhatsApp CTA.
12. Footer.

There is no Featured Products section, no Selected Products section, no Best Sellers section, and no algorithmic recommendation block.

Homepage content management may allow admin to edit text, imagery, banners, visibility, and section order, but it must NOT introduce manual product-selection logic. Data-driven sections remain data-driven.

## 5. Visual design system
### Tone
- Premium, feminine-friendly but family-appropriate.
- Elegant, warm, modern, clean.
- Visual hierarchy based on photography, whitespace, restrained accents, and rounded surfaces.
- Avoid excessive pink; the palette should work equally for men's, children's, baby, and cosmetics sections.

### Initial palette direction
- Warm ivory/cream base.
- Soft blush/rose accent.
- Deeper rose/burgundy for important actions.
- Muted champagne/gold as a small accent.
- Deep charcoal for text/footer.

Exact color tokens will be finalized during Phase 1 after testing contrast and component states.

### Typography
Use an Arabic-capable production font selected during Phase 1 based on legibility, hierarchy, and brand fit. Candidate families may include Cairo, Tajawal, Alexandria, or IBM Plex Sans Arabic. Do not load unnecessary font weights.

### Responsive philosophy
Mobile-first, then tablet, then desktop. Do not simply shrink desktop into mobile. Critical screens must be designed intentionally for at least phone, tablet, and desktop widths.

### Motion
Subtle, purposeful transitions only. Respect reduced-motion preferences. No animation that blocks shopping actions or creates layout instability.

### Logo
Create an original Arabic-compatible Amira Store logo/mark appropriate to the brand. Provide replaceable assets and a future-safe storage path. The logo must be manageable from Admin without code edits.

## 6. Product domain
### Product
Core fields:
- id
- name
- slug
- short description
- full description
- category
- status (`draft`, `active`, `archived`)
- SEO metadata
- created_at
- updated_at

### Attribute
Generic reusable attribute definitions, for example:
- size
- color
- volume
- shade
- material
- style

The admin can use only the attributes a product actually needs.

### Variant
Each sellable combination is explicit. A product may have:
- no selectable attributes (default variant),
- one attribute (size only, color only, volume only, etc.),
- or multiple attributes (size + color, etc.).

Do NOT force size and color into a matrix. Only actual sellable variants should exist.

Variant fields:
- id
- product_id
- sku
- original_price
- current_price
- stock_quantity
- low_stock_threshold
- active status
- timestamps

### Variant attributes
Many-to-many relationship between variants and attribute values; composite uniqueness prevents duplicate assignments.

### Images
Support product gallery plus optional variant-specific images. At minimum:
- primary image
- gallery images
- variant images when applicable
- alt text
- ordering

Selecting a color/variant should update displayed imagery if variant images exist.

### Size guide
Optional per-product size guide for clothing. Admin can add rows such as size/bust/waist/length. Do not force it on cosmetics or non-clothing items.

## 7. Pricing rules
Source of truth for sale pricing is the Variant.
- `original_price` is the pre-discount/reference price.
- `current_price` is the actual sell price at order time.
- Display discount amount/percentage only when `current_price < original_price`.
- Order creation re-reads live variant prices server-side.
- Client-submitted price values are ignored.
- Order items store price snapshots so historical orders never change when product prices change.

## 8. Cart and wishlist rules
Cart is guest-based and supports multiple items.
Each cart item is identified by `variantId` plus quantity. Two different variants of the same product can coexist.

Wishlist is guest-only and local to the browser. No server customer account is required.

## 9. Checkout rules
Required:
- customer name
- customer phone
- one address textarea

Optional:
- note/order note

Do not split the address into many fields. Do not require customer registration.

Payment method is always Cash on Delivery.

Shipping is not calculated on-site. The checkout must explain that shipping is finalized through WhatsApp after reviewing the customer's address.

## 10. Order creation and WhatsApp
Order creation is the authoritative business action. It must succeed before WhatsApp is opened.

Order creation transaction must:
1. Validate checkout input.
2. Re-read current price and active status for all variants.
3. Verify stock.
4. Create/update customer record by normalized phone where appropriate.
5. Create order and order items with snapshots.
6. Decrement variant stock immediately.
7. Record inventory movements.
8. Commit atomically.
9. Generate order number.
10. Build a pre-filled WhatsApp message from the committed order snapshot.
11. Show success page.
12. Open WhatsApp or provide a visible fallback button.

Prevent duplicate order creation from double-click/retry using an idempotency mechanism.

Default WhatsApp number: `+201019003677`, editable from Admin Settings.

WhatsApp must use international format. The prepared message is shown in the chat composer; the customer still presses Send. No automatic outbound message API is required for v1.

Suggested message content:
- greeting
- order number
- each product name
- selected attributes where applicable (size/color/etc.)
- quantity
- actual unit price
- products total
- payment method
- customer address
- statement that shipping cost will be finalized through WhatsApp
- thank-you closing

## 11. Shipping and totals
At creation time:
- `products_total` = sum of order item subtotals.
- `shipping_cost` = null until confirmed by admin/WhatsApp.
- `grand_total` initially equals products total, then updates when shipping is entered.

Admin may set shipping cost after discussing the address with the customer. Final total is recalculated server-side.

## 12. Order statuses
### Order status
- `new`
- `under_review`
- `confirmed`
- `preparing`
- `completed`
- `canceled`

### Shipping status
- `not_started`
- `preparing`
- `ready_to_ship`
- `shipped`
- `out_for_delivery`
- `delivered`
- `delivery_failed`
- `returned_to_stock`

Status transitions should be validated. Inventory behavior must remain consistent when an order becomes canceled or when an admin explicitly reactivates an order.

## 13. Inventory rules
Inventory is tracked per variant.

On successful checkout:
- decrement stock immediately.
- record a `sale` movement.

On cancellation of a previously reserved/sold order:
- restore stock exactly once.
- record a cancellation-return movement.

On admin quantity/item edits:
- calculate inventory deltas against the prior order state.
- apply all necessary stock changes transactionally.
- reject edits that would create negative stock.

Maintain an auditable movement ledger with before/after quantities.

## 14. Customer/order tracking
No customer account.

Tracking page requires:
- order number
- phone used at checkout

Use rate limiting and avoid leaking whether an order exists through verbose error differences.

Display a clear order timeline using current order/shipping states.

## 15. Reviews
### Site reviews
- Customer can review products without an account.
- Verification should use order number + checkout phone.
- Prefer allowing review only for delivered order items.
- Link review to order item where possible.
- Rating 1–5.
- Comment.
- Optional customer image.
- Review moderation: pending / approved / rejected.
- Approved verified reviews may display “مشتري موثّق”.
- Avoid duplicate reviews for the same order item.

### WhatsApp testimonials
Separate entity and UI from site reviews.
Admin can add:
- screenshot/image
- display name
- optional city
- optional caption
- optional linked product
- publish state
- ordering

Do not claim a WhatsApp screenshot is a site review. Label it accurately.

## 16. Admin domain
Single admin only.
Login: username + password.
No registration, create-admin, forgot-password, email recovery, or admin email.

Admin can change password from inside the dashboard by confirming current password and entering new password twice.

Admin modules:
- dashboard
- orders
- products
- categories
- inventory
- reviews
- WhatsApp testimonials
- homepage content
- media
- customers
- settings/security

## 17. Product admin experience
The product editor should support:
1. Basic information.
2. Category.
3. Description.
4. SEO metadata.
5. Gallery.
6. Generic attributes.
7. Explicit variants.
8. Per-variant SKU.
9. Per-variant original/current prices.
10. Per-variant stock.
11. Per-variant images.
12. Optional size guide.
13. Publish/archived state.

The editor must make it easy to build size-only, color-only, combined, or no-option products without creating invalid variants.

## 18. Order admin experience
Order detail must show:
- order number
- customer
- phone
- address
- items and snapshots
- selected attributes
- quantity
- original/current prices at order time
- products total
- shipping cost
- grand total
- payment method/status
- order status
- shipping status
- notes
- timestamps
- inventory movements related to the order
- WhatsApp handoff context if stored

Admin can edit permitted fields. All dangerous inventory-affecting edits must be transactional and logged.

## 19. Search
Search must be Arabic-aware and professional:
- exact/prefix matches
- typo-tolerant matching where practical
- category-aware searching
- product name, SKU, descriptions, attribute values
- autocomplete suggestions
- filters and sorting

Initial architecture may use PostgreSQL capabilities including `pg_trgm` where supported; keep search code behind a service so a dedicated engine can be introduced later without changing UI contracts.

## 20. Media storage
Use Vercel Blob as the initial media store because the target hosting platform is Vercel. Public assets (product/catalog imagery, approved public logo) may use public storage; sensitive/admin-only originals such as unapproved testimonial screenshots may use private storage until publication. Vercel Blob currently supports public/private access and modern authentication options. The provider implementation must be isolated behind a media service.

## 21. SEO
Implement:
- metadata per page
- canonical URLs
- robots
- sitemap
- Open Graph
- Product/ProductGroup structured data for products with variants
- accurate price/availability data
- semantic headings
- Arabic metadata

Avoid indexing combinatorial filter URLs by default unless intentionally configured.

## 22. Accessibility
Target WCAG 2.2 AA.
Include keyboard access, visible focus, labels, sufficient contrast, semantic landmarks, accessible forms, touch targets, and reduced-motion support.

## 23. Performance
Target Core Web Vitals at the 75th percentile separately for mobile and desktop:
- LCP <= 2.5s
- INP <= 200ms
- CLS <= 0.1

Use optimized responsive images, limited client JavaScript, server-first rendering where appropriate, caching/revalidation, and stable layout dimensions.

## 24. Security
- Strong password hashing.
- Secure session cookie.
- Server-side authorization on every admin mutation.
- Validate all input with Zod or equivalent.
- Do not trust client prices, stock, product names, totals, or status values.
- Rate-limit admin login, order tracking, review submission, and checkout where appropriate.
- Protect upload endpoints by auth and strict file validation.
- No secrets in source control.
- Security headers as appropriate.
- Avoid exposing internal IDs unnecessarily.
- Audit high-impact admin actions.

## 25. Database implementation direction
PostgreSQL on Neon with Drizzle ORM.
Migration files are committed to Git.
Use `drizzle-kit generate` to create SQL migrations and `drizzle-kit migrate` to apply them. Use direct schema push only for safe disposable/local development, never as the production change mechanism.

## 26. Proposed core tables
- admin_users
- admin_sessions
- admin_activity_logs
- categories
- products
- product_images
- attributes
- attribute_values
- product_variants
- variant_attribute_values
- media_assets
- size_guides
- size_guide_rows
- customers
- orders
- order_items
- inventory_movements
- reviews
- review_images
- whatsapp_testimonials
- store_settings
- homepage_sections
- homepage_banners

Exact columns, indexes, foreign keys, enums, constraints, and JSONB usage are defined during Phase 2 and captured in `docs/DATA_DICTIONARY.md`.

## 27. Deployment architecture
Target stack:
- Next.js App Router
- TypeScript strict mode
- PostgreSQL/Neon
- Drizzle ORM
- Tailwind CSS + component system chosen during foundation
- Vercel deployment
- GitHub source control
- Vercel Blob for media

Environment model:
- Development
- Preview
- Production

Use separate environment variables and databases/branches. Do not point Preview to Production data by default.

## 28. Git workflow
Suggested branch names:
- `feat/...`
- `fix/...`
- `chore/...`
- `docs/...`

Each completed phase should end in a focused commit. PRs should pass required checks before merge. Vercel Preview deployment should be used before production.

## 29. Execution architecture for the AI agent
The project is intentionally split into 15 implementation phases. The agent must execute exactly one current phase at a time.

Every phase file contains:
- objective
- prerequisites
- exact scope
- expected files/layers
- integration points
- tests
- manual verification
- Definition of Done
- stop conditions

After a phase passes:
1. Update `EXECUTION_STATUS.md`.
2. Update traceability.
3. Record commit hash/message.
4. Start the next phase only on the next agent run/command.

Do not send one 100-page prompt and ask the agent to “remember everything.” Repository state is the durable memory.

## 30. Issue handling
See `docs/ops/ISSUE_LOG.md` and `docs/ops/ERROR_PROTOCOL.md`.
The rule is transparency: every meaningful implementation error is recorded. Fix the root cause with the smallest necessary change; do not hide, suppress, or work around an error without documenting why.

## 31. Final launch requirements
The project is launch-ready only after:
- all phases PASS
- production migration rehearsal passes
- production build passes
- all mandatory tests pass
- admin login/change-password verified
- product/variant pricing verified
- stock decrement/cancel restoration verified
- order tracking verified
- WhatsApp handoff verified
- responsive UX inspected on phone/tablet/desktop
- SEO/accessibility/performance checks pass
- no secrets are committed
- GitHub main is green
- Vercel production deployment is healthy
- Neon production migration state matches the repository

## 32. Current owner-approved defaults
- Store name: أميرة استور
- Default WhatsApp: +201019003677
- Currency: EGP
- Language: Arabic only
- Payment: COD
- Customer account: none
- Admin count: one
- Shipping calculation: WhatsApp/manual after address
- Returns/exchanges software workflow: none
- Brands: none
- Coupons: none
- Best sellers: none
- Featured/selected products: none
- New arrivals: real `created_at` driven
- Future mobile app: architecture should remain API/domain ready
