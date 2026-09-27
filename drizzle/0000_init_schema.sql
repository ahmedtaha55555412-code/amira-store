CREATE TYPE "public"."inventory_movement_type" AS ENUM('opening', 'sale', 'cancellation_return', 'manual_adjustment', 'order_edit_increase', 'order_edit_decrease', 'other');--> statement-breakpoint
CREATE TYPE "public"."media_access_mode" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'under_review', 'confirmed', 'preparing', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cod');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'collected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."shipping_status" AS ENUM('not_started', 'preparing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned_to_stock');--> statement-breakpoint
CREATE TYPE "public"."testimonial_status" AS ENUM('draft', 'published', 'hidden');--> statement-breakpoint
CREATE TABLE "admin_activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"session_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"user_agent" text,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_username_nonempty" CHECK (length(trim(username)) > 0),
	CONSTRAINT "admin_users_password_hash_nonempty" CHECK (length(password_hash) > 0)
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'vercel_blob' NOT NULL,
	"pathname" text NOT NULL,
	"url" text NOT NULL,
	"access_mode" "media_access_mode" DEFAULT 'public' NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"alt_text" text,
	"metadata" jsonb,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_size_nonnegative" CHECK (size_bytes >= 0)
);
--> statement-breakpoint
CREATE TABLE "attribute_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attribute_id" uuid NOT NULL,
	"value" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "attribute_values_value_nonempty" CHECK (length(trim(value)) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_values_id_attribute_key" ON "attribute_values" USING btree ("id","attribute_id");--> statement-breakpoint
CREATE TABLE "attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "attributes_name_nonempty" CHECK (length(trim(name)) > 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_media_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_nonempty" CHECK (length(trim(name)) > 0)
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"media_asset_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"alt_text" text
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"original_price" numeric(12, 2) NOT NULL,
	"current_price" numeric(12, 2) NOT NULL,
	"stock_quantity" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_original_price_positive" CHECK (original_price > 0),
	CONSTRAINT "product_variants_current_price_positive" CHECK (current_price > 0),
	CONSTRAINT "product_variants_stock_nonnegative" CHECK (stock_quantity >= 0),
	CONSTRAINT "product_variants_low_stock_threshold_nonnegative" CHECK (low_stock_threshold >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"short_description" text,
	"description" text,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"canonical_slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_name_nonempty" CHECK (length(trim(name)) > 0)
);
--> statement-breakpoint
CREATE TABLE "size_guide_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"size_guide_id" uuid NOT NULL,
	"size_label" text NOT NULL,
	"measurements" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "size_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "variant_attribute_values" (
	"variant_id" uuid NOT NULL,
	"attribute_value_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	CONSTRAINT "variant_attribute_values_pkey" PRIMARY KEY("variant_id","attribute_value_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"phone_normalized" text NOT NULL,
	"address_last_used" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_name_snapshot" text NOT NULL,
	"variant_attributes_snapshot" jsonb NOT NULL,
	"sku_snapshot" text NOT NULL,
	"original_unit_price_snapshot" numeric(12, 2) NOT NULL,
	"current_unit_price_snapshot" numeric(12, 2) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK (quantity > 0),
	CONSTRAINT "order_items_original_unit_price_positive" CHECK (original_unit_price_snapshot > 0),
	CONSTRAINT "order_items_current_unit_price_positive" CHECK (current_unit_price_snapshot > 0),
	CONSTRAINT "order_items_unit_price_positive" CHECK (unit_price > 0),
	CONSTRAINT "order_items_subtotal_nonnegative" CHECK (subtotal >= 0),
	CONSTRAINT "order_items_subtotal_identity" CHECK (subtotal = unit_price * quantity)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_status" "order_status" DEFAULT 'new' NOT NULL,
	"shipping_status" "shipping_status" DEFAULT 'not_started' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cod' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"products_total" numeric(12, 2) NOT NULL,
	"shipping_cost" numeric(12, 2),
	"grand_total" numeric(12, 2) NOT NULL,
	"address_snapshot" text NOT NULL,
	"customer_name_snapshot" text NOT NULL,
	"customer_phone_snapshot" text NOT NULL,
	"whatsapp_phone_snapshot" text NOT NULL,
	"notes" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_products_total_nonnegative" CHECK (products_total >= 0),
	CONSTRAINT "orders_shipping_cost_nonnegative" CHECK (shipping_cost IS NULL OR shipping_cost >= 0),
	CONSTRAINT "orders_grand_total_nonnegative" CHECK (grand_total >= 0),
	CONSTRAINT "orders_grand_total_identity" CHECK (grand_total = products_total + COALESCE(shipping_cost, 0)),
	CONSTRAINT "orders_customer_name_snapshot_nonempty" CHECK (length(trim(customer_name_snapshot)) > 0),
	CONSTRAINT "orders_customer_phone_snapshot_nonempty" CHECK (length(trim(customer_phone_snapshot)) > 0),
	CONSTRAINT "orders_address_snapshot_nonempty" CHECK (length(trim(address_snapshot)) > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"order_id" uuid,
	"admin_user_id" uuid,
	"movement_type" "inventory_movement_type" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"stock_before" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_delta_nonzero" CHECK (quantity_delta <> 0),
	CONSTRAINT "inventory_movements_stock_before_nonnegative" CHECK (stock_before >= 0),
	CONSTRAINT "inventory_movements_stock_after_nonnegative" CHECK (stock_after >= 0),
	CONSTRAINT "inventory_movements_stock_identity" CHECK (stock_after = stock_before + quantity_delta)
);
--> statement-breakpoint
CREATE TABLE "review_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"order_item_id" uuid,
	"customer_id" uuid,
	"rating" smallint NOT NULL,
	"comment" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"is_verified_purchase" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK (rating BETWEEN 1 AND 5),
	CONSTRAINT "reviews_comment_nonempty" CHECK (length(trim(comment)) > 0)
);
--> statement-breakpoint
CREATE TABLE "whatsapp_testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"display_name" text,
	"city" text,
	"caption" text,
	"media_asset_id" uuid NOT NULL,
	"status" "testimonial_status" DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homepage_banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"media_asset_id" uuid NOT NULL,
	"cta_label" text,
	"cta_href" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	CONSTRAINT "homepage_banners_title_nonempty" CHECK (length(trim(title)) > 0)
);
--> statement-breakpoint
CREATE TABLE "homepage_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_key" text NOT NULL,
	"title" text,
	"subtitle" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"config" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"store_name" text NOT NULL,
	"logo_media_id" uuid,
	"favicon_media_id" uuid,
	"whatsapp_phone" text NOT NULL,
	"whatsapp_message_template" text NOT NULL,
	"support_phone" text,
	"footer_text" text,
	"social_links" jsonb,
	"currency_code" text DEFAULT 'EGP' NOT NULL,
	"locale" text DEFAULT 'ar' NOT NULL,
	"timezone" text DEFAULT 'Africa/Cairo' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_settings_singleton" CHECK (id = 1),
	CONSTRAINT "store_settings_whatsapp_phone_nonempty" CHECK (length(trim(whatsapp_phone)) > 0),
	CONSTRAINT "store_settings_store_name_nonempty" CHECK (length(trim(store_name)) > 0)
);
--> statement-breakpoint
ALTER TABLE "admin_activity_logs" ADD CONSTRAINT "admin_activity_logs_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_image_media_id_media_assets_id_fk" FOREIGN KEY ("image_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "size_guide_rows" ADD CONSTRAINT "size_guide_rows_size_guide_id_size_guides_id_fk" FOREIGN KEY ("size_guide_id") REFERENCES "public"."size_guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "size_guides" ADD CONSTRAINT "size_guides_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_attribute_value_id_attribute_values_id_fk" FOREIGN KEY ("attribute_value_id") REFERENCES "public"."attribute_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_value_attribute_pair_fk" FOREIGN KEY ("attribute_value_id","attribute_id") REFERENCES "public"."attribute_values"("id","attribute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_images" ADD CONSTRAINT "review_images_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_images" ADD CONSTRAINT "review_images_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_testimonials" ADD CONSTRAINT "whatsapp_testimonials_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_testimonials" ADD CONSTRAINT "whatsapp_testimonials_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homepage_banners" ADD CONSTRAINT "homepage_banners_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_logo_media_id_media_assets_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_favicon_media_id_media_assets_id_fk" FOREIGN KEY ("favicon_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admin_activity_logs_admin" ON "admin_activity_logs" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "idx_admin_activity_logs_entity" ON "admin_activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_admin_activity_logs_created" ON "admin_activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "idx_admin_sessions_admin" ON "admin_sessions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "idx_admin_sessions_expires" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_pathname_key" ON "media_assets" USING btree ("pathname");--> statement-breakpoint
CREATE INDEX "idx_media_assets_created" ON "media_assets" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_values_attribute_slug_key" ON "attribute_values" USING btree ("attribute_id","slug");--> statement-breakpoint
CREATE INDEX "idx_attribute_values_attribute" ON "attribute_values" USING btree ("attribute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attributes_slug_key" ON "attributes" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_key" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_categories_parent" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_product_images_product" ON "product_images" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_images_variant" ON "product_images" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "idx_product_images_media" ON "product_images" USING btree ("media_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_product_primary_key" ON "product_images" USING btree ("product_id") WHERE is_primary AND variant_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_variant_primary_key" ON "product_images" USING btree ("variant_id") WHERE is_primary AND variant_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_product_media_key" ON "product_images" USING btree ("product_id","media_asset_id") WHERE variant_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_variant_media_key" ON "product_images" USING btree ("variant_id","media_asset_id") WHERE variant_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "idx_product_variants_product" ON "product_variants" USING btree ("product_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_product_variants_stock" ON "product_variants" USING btree ("stock_quantity");--> statement-breakpoint
CREATE INDEX "idx_product_variants_offers" ON "product_variants" USING btree ("product_id","current_price") WHERE is_active AND current_price < original_price;--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_key" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_products_category_status" ON "products" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "idx_products_created_at_desc" ON "products" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_size_guide_rows_guide" ON "size_guide_rows" USING btree ("size_guide_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "size_guides_product_key" ON "size_guides" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variant_attribute_values_variant_attribute_key" ON "variant_attribute_values" USING btree ("variant_id","attribute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_normalized_key" ON "customers" USING btree ("phone_normalized");--> statement-breakpoint
CREATE INDEX "idx_customers_name" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_variant_key" ON "order_items" USING btree ("order_id","variant_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_order" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_product" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_variant" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_unique" ON "orders" USING btree ("idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("order_status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_orders_shipping_status" ON "orders" USING btree ("shipping_status");--> statement-breakpoint
CREATE INDEX "idx_orders_payment_status" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "idx_orders_customer" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_orders_phone_snapshot" ON "orders" USING btree ("customer_phone_snapshot");--> statement-breakpoint
CREATE INDEX "idx_inventory_movements_variant" ON "inventory_movements" USING btree ("variant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_inventory_movements_order" ON "inventory_movements" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_movements_admin" ON "inventory_movements" USING btree ("admin_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_order_cancel_return_key" ON "inventory_movements" USING btree ("order_id") WHERE movement_type = 'cancellation_return';--> statement-breakpoint
CREATE UNIQUE INDEX "review_images_review_media_key" ON "review_images" USING btree ("review_id","media_asset_id");--> statement-breakpoint
CREATE INDEX "idx_review_images_review" ON "review_images" USING btree ("review_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_reviews_product_status" ON "reviews" USING btree ("product_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_reviews_order_item" ON "reviews" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_status" ON "reviews" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_item_verified_key" ON "reviews" USING btree ("order_item_id") WHERE order_item_id IS NOT NULL AND is_verified_purchase;--> statement-breakpoint
CREATE INDEX "idx_whatsapp_testimonials_status" ON "whatsapp_testimonials" USING btree ("status","sort_order");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_testimonials_product" ON "whatsapp_testimonials" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_homepage_banners_active" ON "homepage_banners" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "homepage_sections_key_key" ON "homepage_sections" USING btree ("section_key");--> statement-breakpoint
CREATE INDEX "idx_homepage_sections_sort" ON "homepage_sections" USING btree ("is_enabled","sort_order");