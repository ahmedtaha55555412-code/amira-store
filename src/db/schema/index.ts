/**
 * Amira Store — schema barrel.
 *
 * Import the data layer from `@/db` (client) and tables/types from here.
 * Load order note: table modules carry no cross-imports except FK targets;
 * relations are centralized in ./relations.ts to avoid circular evaluation.
 */

export * from './enums';
export * from './admin';
export * from './media';
export * from './catalog';
export * from './customers-orders';
export * from './inventory';
export * from './reviews';
export * from './settings';
export * from './relations';

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

/**
 * Full schema object passed to the Drizzle client — powers `db.query.*`
 * relational selects (RLS-free relational query API needs every table).
 */
export const schema = {
  adminUsers,
  adminSessions,
  adminActivityLogs,
  categories,
  products,
  attributes,
  attributeValues,
  productVariants,
  variantAttributeValues,
  productImages,
  sizeGuides,
  sizeGuideRows,
  mediaAssets,
  customers,
  orders,
  orderItems,
  inventoryMovements,
  reviews,
  reviewImages,
  whatsappTestimonials,
  storeSettings,
  homepageSections,
  homepageBanners,
};
