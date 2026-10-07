CREATE UNIQUE INDEX "product_variants_id_product_key" ON "product_variants" USING btree ("id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_canonical_slug_key" ON "products" USING btree ("canonical_slug") WHERE canonical_slug IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_id_product_key" ON "order_items" USING btree ("id","product_id");--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_product_fk" FOREIGN KEY ("variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_product_fk" FOREIGN KEY ("variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_product_fk" FOREIGN KEY ("order_item_id","product_id") REFERENCES "public"."order_items"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
