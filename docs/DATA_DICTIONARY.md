# Data Dictionary — Planned Neon/Drizzle Schema

This is the target logical model. The implementing agent must turn it into strict Drizzle/PostgreSQL definitions during PHASE_02 and document any justified change here before proceeding.

## admin_users
- id: uuid PK
- username: text UNIQUE NOT NULL
- password_hash: text NOT NULL
- is_active: boolean NOT NULL DEFAULT true
- last_login_at: timestamptz nullable
- created_at, updated_at: timestamptz
Constraint/business rule: exactly one active admin is supported by application bootstrap. No create-admin endpoint/page.

## admin_sessions
- id: uuid PK
- admin_user_id: FK
- session_token_hash: text UNIQUE NOT NULL
- expires_at: timestamptz NOT NULL
- created_at: timestamptz NOT NULL
- last_seen_at nullable
- user_agent nullable
- ip_hash nullable

## admin_activity_logs
- id: uuid PK
- admin_user_id FK
- action: text/enum
- entity_type
- entity_id nullable
- metadata jsonb nullable
- created_at

## categories
- id uuid PK
- parent_id uuid nullable self-FK
- name text NOT NULL
- slug text UNIQUE NOT NULL
- description nullable
- image_media_id nullable FK media_assets
- sort_order int NOT NULL DEFAULT 0
- is_active boolean NOT NULL DEFAULT true
- created_at, updated_at

## products
- id uuid PK
- category_id FK
- name text NOT NULL
- slug text UNIQUE NOT NULL
- short_description nullable
- description nullable
- status enum draft/active/archived
- meta_title nullable
- meta_description nullable
- canonical_slug/url nullable as appropriate
- created_at, updated_at

## attributes
- id uuid PK
- name text NOT NULL
- slug text UNIQUE NOT NULL
- is_active boolean NOT NULL DEFAULT true
- sort_order int

## attribute_values
- id uuid PK
- attribute_id FK
- value text NOT NULL
- slug text NOT NULL
- sort_order int
- UNIQUE(attribute_id, slug)

## product_variants
- id uuid PK
- product_id FK
- sku text UNIQUE NOT NULL
- original_price numeric(12,2) NOT NULL
- current_price numeric(12,2) NOT NULL
- stock_quantity int NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0)
- low_stock_threshold int NOT NULL DEFAULT 3
- is_active boolean NOT NULL DEFAULT true
- created_at, updated_at

Business check: current_price > 0, original_price > 0, and discount display derives from comparison.

## variant_attribute_values
- variant_id FK
- attribute_value_id FK
- composite PK(variant_id, attribute_value_id)
- uniqueness rules prevent duplicate attribute values on the same variant
Application validation should ensure a variant does not contain two values from the same attribute unless a future explicit multi-select rule is added.

## media_assets
- id uuid PK
- provider text (initially vercel_blob)
- pathname text UNIQUE NOT NULL
- url text NOT NULL
- access_mode public/private
- mime_type text NOT NULL
- size_bytes bigint NOT NULL
- width int nullable
- height int nullable
- alt_text nullable
- metadata jsonb nullable
- created_by_admin_id nullable FK
- created_at

## product_images
- id uuid PK
- product_id FK
- variant_id nullable FK
- media_asset_id FK
- is_primary boolean DEFAULT false
- sort_order int DEFAULT 0
- alt_text nullable

## size_guides
- id uuid PK
- product_id FK UNIQUE
- title nullable
- notes nullable

## size_guide_rows
- id uuid PK
- size_guide_id FK
- size_label text
- measurements jsonb
- sort_order int

## customers
- id uuid PK
- name text NOT NULL
- phone text NOT NULL
- phone_normalized text NOT NULL INDEXED
- address_last_used nullable
- created_at, updated_at

No password, no customer session, no customer email required.

## orders
- id uuid PK
- order_number text UNIQUE NOT NULL
- customer_id FK
- order_status enum
- shipping_status enum
- payment_method enum: cod only
- payment_status enum: pending/collected/failed or final agreed set
- products_total numeric(12,2) NOT NULL
- shipping_cost numeric(12,2) nullable
- grand_total numeric(12,2) NOT NULL
- address_snapshot text NOT NULL
- customer_name_snapshot text NOT NULL
- customer_phone_snapshot text NOT NULL
- notes nullable
- whatsapp_phone_snapshot text NOT NULL
- created_at, updated_at

Important: customer/order snapshots preserve historical order truth.

## order_items
- id uuid PK
- order_id FK
- product_id FK nullable if future deletion policy requires; preferred soft-delete products
- variant_id FK
- product_name_snapshot text
- variant_attributes_snapshot jsonb
- sku_snapshot text
- original_unit_price_snapshot numeric(12,2)
- current_unit_price_snapshot numeric(12,2)
- unit_price numeric(12,2)
- quantity int CHECK(quantity > 0)
- subtotal numeric(12,2)
- created_at

## inventory_movements
- id uuid PK
- variant_id FK
- order_id nullable FK
- admin_user_id nullable FK
- movement_type enum: opening, sale, cancellation_return, manual_adjustment, order_edit_increase, order_edit_decrease, other
- quantity_delta int NOT NULL
- stock_before int NOT NULL
- stock_after int NOT NULL
- reason nullable
- created_at

## reviews
- id uuid PK
- product_id FK
- order_item_id nullable FK
- customer_id nullable FK
- rating smallint CHECK 1..5
- comment text
- status enum pending/approved/rejected
- is_verified_purchase boolean NOT NULL DEFAULT false
- created_at, updated_at

Uniqueness: one review per order_item for verified reviews.

## review_images
- id uuid PK
- review_id FK
- media_asset_id FK
- sort_order int

## whatsapp_testimonials
- id uuid PK
- product_id nullable FK
- display_name nullable
- city nullable
- caption nullable
- media_asset_id FK
- status enum draft/published/hidden
- sort_order int
- created_at, updated_at

## store_settings
Singleton-style row containing known settings such as:
- store_name
- logo_media_id
- favicon_media_id
- whatsapp_phone
- whatsapp_message_template
- support_phone nullable
- footer text
- social links jsonb
- currency_code
- locale
- timezone
- updated_at

Do not store secret credentials in this table.

## homepage_sections
- id uuid PK
- section_key UNIQUE
- title nullable
- subtitle nullable
- is_enabled boolean
- sort_order int
- config jsonb nullable
- updated_at

Allowed section keys are limited by code to prevent arbitrary product selection logic. Product-driven sections such as new_arrivals and offers fetch products from rules defined in code.

## homepage_banners
- id uuid PK
- title
- subtitle nullable
- media_asset_id FK
- cta_label nullable
- cta_href nullable
- is_active
- sort_order
- starts_at nullable
- ends_at nullable

## Critical database constraints
- No negative stock.
- No duplicate SKU.
- No duplicate variant attribute assignments.
- No duplicate product slug/category slug/attribute slug.
- Order items must always have positive quantity and nonnegative monetary amounts.
- All inventory-affecting order mutations run in a transaction.
- Never derive historical order totals from current product data.

---

## PHASE_02 implementation notes (2026-09-27)

The schema above was implemented in `src/db/schema/*` with Drizzle ORM. The following
justified decisions/additions were made during implementation; each is DB-enforced and
verified by `scripts/verify-migrations.ts` (see `docs/ops/DATABASE.md`):

1. **`variant_attribute_values.attribute_id` (added, denormalized)** — references
   `attributes.id`; guarded by a composite FK
   `(attribute_value_id, attribute_id) → attribute_values(id, attribute_id)` and
   `UNIQUE(variant_id, attribute_id)`. This turns the documented application-level rule
   "a variant does not contain two values from the same attribute" into a hard database
   invariant (concurrency-safe for checkout/order-edit phases) without coupling size to
   color. Mismatched value/attribute pairs are structurally impossible.
2. **`customers.phone_normalized` is UNIQUE** (dictionary said "indexed") — MASTER_PLAN §10
   requires create/update-by-normalized-phone; uniqueness makes that upsert race-safe and
   prevents duplicate customer rows. Order snapshots keep historical truth independent.
3. **`orders.idempotency_key` (added)** — partial unique index `WHERE idempotency_key IS NOT NULL`.
   Schema slot for the PHASE-07 duplicate-submit contract; NULL for non-checkout provenance.
4. **`orders` CHECK `grand_total = products_total + COALESCE(shipping_cost, 0)`** — encodes
   the §11 totals flow (grand total starts at products total; updates only when shipping
   is recorded). Also `products_total >= 0`, `shipping_cost` NULL-or-nonnegative,
   `grand_total >= 0`, non-empty snapshots.
5. **`order_items` CHECKs** — `quantity > 0`, all unit-price snapshots `> 0`,
   `subtotal >= 0`, and exact identity `subtotal = unit_price * quantity`
   (scale-2 value × integer never rounds). `UNIQUE(order_id, variant_id)` enforces one
   line per variant per order (quantities merge at checkout).
6. **`order_items.product_id` is NOT NULL with ON DELETE RESTRICT** (dictionary allowed
   nullable "if future deletion policy requires") — we adopt the dictionary's PREFERRED
   soft-delete policy: products are archived, never hard-deleted, so order history keeps
   a permanent referential link. `variant_id` likewise NOT NULL RESTRICT.
7. **`inventory_movements` ledger integrity** — CHECKs `quantity_delta <> 0`,
   `stock_before >= 0`, `stock_after >= 0`, `stock_after = stock_before + quantity_delta`
   ("no negative stock" is structural). Partial unique index
   `(order_id) WHERE movement_type = 'cancellation_return'` enforces MASTER_PLAN §13
   "restore stock exactly once" per order at the database level.
   **PHASE-08 refinement (2026-09-28, migration 0002):** the partial unique index is
   now `(order_id, variant_id) WHERE movement_type = 'cancellation_return'`. The
   original order_id-only form structurally forbade a multi-line order from recording
   one auditable before/after restoration row PER restored variant, which MASTER_PLAN
   §13's "auditable movement ledger" requires. The refined index keeps the exactly-once
   guarantee (a second cancellation_return for the SAME order+variant is still
   impossible) while allowing exactly one restoration row per distinct variant.
8. **`reviews` partial unique index** `(order_item_id) WHERE order_item_id IS NOT NULL AND
   is_verified_purchase` — implements "one review per order_item for verified reviews".
   `rating` CHECK 1..5; comment non-empty; status defaults to `pending` (moderation).
9. **`product_images`** — partial unique indexes: exactly one product-level primary
   (`WHERE is_primary AND variant_id IS NULL`), at most one variant-level primary
   (`WHERE is_primary AND variant_id IS NOT NULL`), plus media-uniqueness per level
   (`(product_id, media_asset_id)` where gallery / `(variant_id, media_asset_id)` where
   variant image) — keeps catalog edits and seeds idempotent.
10. **`store_settings` is a true singleton** — `id integer PRIMARY KEY DEFAULT 1` with
    CHECK `id = 1`. Dictionary said "singleton-style row"; this makes it structural.
11. **`products.canonical_slug`** chosen from the dictionary's "canonical_slug/url as
    appropriate" — slug is domain-independent; absolute URLs are built at render time.
12. **Enum sets frozen as dictionary/MASTER_PLAN define them** — `product_status`
    (draft/active/archived), `order_status`, `shipping_status` (§12), `payment_method`
    (cod only), `payment_status` (pending/collected/failed), `inventory_movement_type`
    (§13), `review_status`, `testimonial_status`, `media_access_mode`.
13. **`pg_trgm` intentionally NOT in the initial migration** (task 10 allows optional) —
    portable baseline with btree indexes now; PHASE-05 may add the extension in its own
    migration if it provides measurable search value on Neon.
14. **`updated_at` is application-maintained** (defaults to `now()`; no triggers) — all
    writes flow through the app layer; keeps migrations simple.
15. **Index set** (task 9) — slugs (unique), SKU (unique), `categories(parent_id)`,
    `customers(phone_normalized)` unique, `orders(order_number)` unique,
    status/filter columns (`products(category_id,status)`, `orders` status/shipping/payment,
    `reviews(product_id,status,created_at)`, `whatsapp_testimonials(status,sort_order)`,
    `homepage_banners(is_active,sort_order)`), inventory variant lookup
    (`inventory_movements(variant_id, created_at DESC)`), review/product lookup,
    `products(created_at DESC)` for New Arrivals, and a partial offers index
    `product_variants(product_id, current_price) WHERE is_active AND current_price < original_price`.
16. **`media_assets.access_mode` is the disclosure gate over a TWO-STORE Blob architecture
    (PHASE-09, ISSUE-2026-09-28-048 FINAL resolution)** — PRIVATE originals (pending review
    images, draft WhatsApp testimonial screenshots) live in a REAL PRIVATE Blob store
    (`amira-testimonials-private`, storage-level privacy: unauthenticated CDN reads rejected);
    public catalog imagery stays in the PUBLIC store (OIDC model, unchanged). The pathname
    namespace (`reviews/`, `testimonials/`) routes provider operations to the private store.
    Semantics: `private` assets are rendered by NO public surface, returned by NO public API
    (admin lists null out private URLs), preview ONLY via the admin-session-gated
    `/api/admin/media/[id]/content` route; approval (reviews) / publication (testimonials)
    flips the registry row to `public` — the deliberate disclosure decision — and approved
    delivery flows EXCLUSIVELY through the controlled app route `/api/media/[id]` (gated on
    registry access_mode AND owning-entity status; the original never leaves the private
    store). Public review-card author note unchanged: site reviews intentionally carry NO
    author-name column — public cards show «عميل أميرة استور» + verified badge only.

---

## PHASE_10 implementation notes (2026-09-29)

The homepage content + settings tables above were activated in PHASE-10 with ZERO schema changes
(no migration; count stays 3). Justified decisions recorded here:

1. **`homepage_sections.section_key` vocabulary is code-limited** (`HOMESECTION_KEYS` in
   `src/lib/admin/homepage.ts`, mirrored as a literal by `scripts/db-bootstrap.ts`): announcement,
   hero, categories, new_arrivals, offers, benefits, brand_story, reviews, testimonials,
   whatsapp_cta. Unknown keys can never be created through the API (validate → 404), and the
   public reader skips any DB-only rows defensively. The 12-block homepage = these 10 managed
   rows + the header/footer layout chrome.
2. **Per-key JSONB config schemas** (zod, server-enforced, `null` = restore code defaults):
   `announcement {message}` (decision D-2 source of the announcement-bar copy),
   `hero {eyebrow?, title, subtitle?, ctaLabel?, ctaHref?}` (ctaHref = relative path or
   `https://wa.me/<digits>` only — external link-farm hrefs refused), `benefits {items[3..6]
   {title, description}}`, `brand_story {body, imageMediaId?}` (public asset, D-4),
   `whatsapp_cta {title?, body?, ctaLabel?}`; the query-driven sections (categories, new_arrivals,
   offers, reviews, testimonials) intentionally define EMPTY schemas — framing (title/subtitle/
   visibility/order) lives in the section columns, and NO product-selection field exists anywhere
   (MASTER_PLAN §4 hard exclusion).
3. **`config: null` is a documented clearing contract** — "restore the code defaults" — not a
   schema violation (ISSUE-2026-09-29-052). The admin manager normalizes empty-string fields to
   omitted and a fully-empty object to null client-side, mirroring the server.
4. **Banners start INACTIVE** (`is_active` default false at the service layer) — activation is an
   explicit admin action; the active reader additionally filters by the optional starts_at/ends_at
   window (`now()`-based) and skips private-store pathnames defensively (D-4).
5. **D-4 public-media rule**: `store_settings.logo_media_id`, `store_settings.favicon_media_id`,
   `homepage_banners.media_asset_id` and `brand_story.config.imageMediaId` may reference ONLY
   `access_mode='public'` image assets — enforced server-side at assignment/creation
   (registry check). The PHASE-09 private two-store model is untouched; private originals can
   never back a public branding surface. Media-registry guarded deletes already cover
   homepage_banners as a hard reference and store_settings as a weak (SET NULL) reference.
6. **`store_settings.whatsapp_phone` normalization** — admin updates are validated with the same
   `normalizeEgyptianPhone` rule the storefront uses (single source of truth); the column stores
   the canonical `+20…` form. Checkout continues to read this row at order creation (PHASE-07
   contract unchanged; `whatsapp_phone_snapshot` semantics untouched).
7. **Singleton audit rows**: store_settings mutations write `entityType='store_settings'` with
   `entityId: null` + `metadata.singleton = 1` (entity_id is a uuid column — ISSUE-2026-09-29-051);
   update + audit run in one transaction.
8. **Section ordering** — `sort_order` is a dense 0..n-1 sequence maintained by an atomic
   complete-order reorder (unknown/duplicate ids refused); the announcement bar is fixed chrome at
   position 0 (its copy/visibility are editable, its position is not).
