/**
 * Amira Store — Drizzle relational definitions (central).
 *
 * All `relations()` calls live in THIS single file on purpose: drizzle
 * evaluates `one()`/`many()` eagerly at module load, and the catalog ↔
 * reviews ↔ inventory triangle is circular. Centralizing relations after all
 * table modules are loaded avoids circular-evaluation failures entirely.
 */

import { relations } from 'drizzle-orm';

import {
  adminActivityLogs,
  adminSessions,
  adminUsers,
} from './admin';
import {
  attributeValues,
  attributes,
  categories,
  productImages,
  productVariants,
  products,
  sizeGuideRows,
  sizeGuides,
  variantAttributeValues,
} from './catalog';
import { customers, orderItems, orders } from './customers-orders';
import { inventoryMovements } from './inventory';
import { mediaAssets } from './media';
import { reviewImages, reviews, whatsappTestimonials } from './reviews';
import {
  homepageBanners,
  homepageSections,
  storeSettings,
} from './settings';

/* --------------------------------- Admin ---------------------------------- */

export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  sessions: many(adminSessions),
  activityLogs: many(adminActivityLogs),
}));

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  adminUser: one(adminUsers, {
    fields: [adminSessions.adminUserId],
    references: [adminUsers.id],
  }),
}));

export const adminActivityLogsRelations = relations(
  adminActivityLogs,
  ({ one }) => ({
    adminUser: one(adminUsers, {
      fields: [adminActivityLogs.adminUserId],
      references: [adminUsers.id],
    }),
  }),
);

/* --------------------------------- Media ---------------------------------- */

export const mediaAssetsRelations = relations(mediaAssets, ({ one, many }) => ({
  createdByAdmin: one(adminUsers, {
    fields: [mediaAssets.createdByAdminId],
    references: [adminUsers.id],
  }),
  productImages: many(productImages),
  reviewImages: many(reviewImages),
}));

/* -------------------------------- Catalog --------------------------------- */

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_parent',
  }),
  children: many(categories, { relationName: 'category_parent' }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  variants: many(productVariants),
  images: many(productImages),
  reviews: many(reviews),
  sizeGuide: one(sizeGuides, {
    fields: [products.id],
    references: [sizeGuides.productId],
  }),
}));

export const attributesRelations = relations(attributes, ({ many }) => ({
  values: many(attributeValues),
}));

export const attributeValuesRelations = relations(
  attributeValues,
  ({ one, many }) => ({
    attribute: one(attributes, {
      fields: [attributeValues.attributeId],
      references: [attributes.id],
    }),
    variantAssignments: many(variantAttributeValues),
  }),
);

export const productVariantsRelations = relations(
  productVariants,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
    attributeAssignments: many(variantAttributeValues),
    images: many(productImages),
    inventoryMovements: many(inventoryMovements),
  }),
);

export const variantAttributeValuesRelations = relations(
  variantAttributeValues,
  ({ one }) => ({
    variant: one(productVariants, {
      fields: [variantAttributeValues.variantId],
      references: [productVariants.id],
    }),
    attributeValue: one(attributeValues, {
      fields: [variantAttributeValues.attributeValueId],
      references: [attributeValues.id],
    }),
    attribute: one(attributes, {
      fields: [variantAttributeValues.attributeId],
      references: [attributes.id],
    }),
  }),
);

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [productImages.variantId],
    references: [productVariants.id],
  }),
  mediaAsset: one(mediaAssets, {
    fields: [productImages.mediaAssetId],
    references: [mediaAssets.id],
  }),
}));

export const sizeGuidesRelations = relations(sizeGuides, ({ one, many }) => ({
  product: one(products, {
    fields: [sizeGuides.productId],
    references: [products.id],
  }),
  rows: many(sizeGuideRows),
}));

export const sizeGuideRowsRelations = relations(sizeGuideRows, ({ one }) => ({
  sizeGuide: one(sizeGuides, {
    fields: [sizeGuideRows.sizeGuideId],
    references: [sizeGuides.id],
  }),
}));

/* --------------------------- Customers / Orders --------------------------- */

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
  reviews: many(reviews),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  items: many(orderItems),
  inventoryMovements: many(inventoryMovements),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
  reviews: many(reviews),
}));

/* -------------------------------- Inventory ------------------------------- */

export const inventoryMovementsRelations = relations(
  inventoryMovements,
  ({ one }) => ({
    variant: one(productVariants, {
      fields: [inventoryMovements.variantId],
      references: [productVariants.id],
    }),
    order: one(orders, {
      fields: [inventoryMovements.orderId],
      references: [orders.id],
    }),
    adminUser: one(adminUsers, {
      fields: [inventoryMovements.adminUserId],
      references: [adminUsers.id],
    }),
  }),
);

/* --------------------------------- Reviews -------------------------------- */

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
  orderItem: one(orderItems, {
    fields: [reviews.orderItemId],
    references: [orderItems.id],
  }),
  customer: one(customers, {
    fields: [reviews.customerId],
    references: [customers.id],
  }),
  images: many(reviewImages),
}));

export const reviewImagesRelations = relations(reviewImages, ({ one }) => ({
  review: one(reviews, {
    fields: [reviewImages.reviewId],
    references: [reviews.id],
  }),
  mediaAsset: one(mediaAssets, {
    fields: [reviewImages.mediaAssetId],
    references: [mediaAssets.id],
  }),
}));

export const whatsappTestimonialsRelations = relations(
  whatsappTestimonials,
  ({ one }) => ({
    product: one(products, {
      fields: [whatsappTestimonials.productId],
      references: [products.id],
    }),
    mediaAsset: one(mediaAssets, {
      fields: [whatsappTestimonials.mediaAssetId],
      references: [mediaAssets.id],
    }),
  }),
);

/* -------------------------------- Settings -------------------------------- */

export const storeSettingsRelations = relations(storeSettings, ({ one }) => ({
  logoMedia: one(mediaAssets, {
    fields: [storeSettings.logoMediaId],
    references: [mediaAssets.id],
  }),
  faviconMedia: one(mediaAssets, {
    fields: [storeSettings.faviconMediaId],
    references: [mediaAssets.id],
  }),
}));

export const homepageBannersRelations = relations(
  homepageBanners,
  ({ one }) => ({
    mediaAsset: one(mediaAssets, {
      fields: [homepageBanners.mediaAssetId],
      references: [mediaAssets.id],
    }),
  }),
);

export const homepageSectionsRelations = relations(
  homepageSections,
  () => ({}),
);
