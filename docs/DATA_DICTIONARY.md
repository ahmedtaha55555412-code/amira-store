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
