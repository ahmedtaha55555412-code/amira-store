/**
 * Amira Store — cart availability service (PHASE-06 task 6).
 *
 * READ-ONLY server truth for the guest cart's stock-aware UX: per requested
 * variant, is it real, active, and purchasable RIGHT NOW (MASTER_PLAN §7: the
 * variant is the pricing/stock source of truth; §8: the cart itself stays
 * client-side — this service never creates cart state).
 *
 * Visibility mirrors the storefront catalog rules (src/lib/storefront/catalog.ts):
 * - variant must exist and be active;
 * - its product must be `active`;
 * - the product's category chain must be fully active (an active product under
 *   an inactive ancestor category is unreachable in the storefront, so a cart
 *   line for it is treated as unavailable too).
 *
 * The response deliberately carries ONLY what the cart needs (no internal
 * metadata, no merchandising fields). Final checkout truth remains the
 * PHASE-07 order-creation revalidation.
 */

import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db/client';
import { categories, productVariants, products } from '@/db/schema';

export type VariantAvailability = {
  variantId: string;
  found: boolean;
  variantActive: boolean;
  productActive: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  /** Server-truth current price (numeric string) — "0.00" when not found. */
  currentPrice: string;
};

/**
 * Resolve availability for up to 50 variants in three small queries
 * (variants+products → the tiny categories table → done). Unknown ids still
 * get a `found: false` row so the client cache never keeps stale optimism.
 */
export async function getVariantsAvailability(variantIds: string[]): Promise<VariantAvailability[]> {
  if (variantIds.length === 0) return [];

  const variantRows = await db
    .select({
      variantId: productVariants.id,
      variantActive: productVariants.isActive,
      stockQuantity: productVariants.stockQuantity,
      lowStockThreshold: productVariants.lowStockThreshold,
      currentPrice: productVariants.currentPrice,
      productId: products.id,
      productStatus: products.status,
      categoryId: products.categoryId,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(inArray(productVariants.id, variantIds));

  // Categories are a small controlled tree (5 departments); one read covers
  // reachability for every requested product.
  const categoryRows = await db
    .select({ id: categories.id, parentId: categories.parentId, isActive: categories.isActive })
    .from(categories);

  const activeById = new Map(categoryRows.map((category) => [category.id, category.isActive]));
  const parentById = new Map(categoryRows.map((category) => [category.id, category.parentId]));

  const isReachable = (categoryId: string): boolean => {
    let current: string | null = categoryId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      if (activeById.get(current) !== true) return false;
      current = parentById.get(current) ?? null;
    }
    return true;
  };

  const byVariantId = new Map(variantRows.map((row) => [row.variantId, row]));
  return variantIds.map((variantId): VariantAvailability => {
    const row = byVariantId.get(variantId);
    if (!row) {
      return {
        variantId,
        found: false,
        variantActive: false,
        productActive: false,
        stockQuantity: 0,
        lowStockThreshold: 0,
        currentPrice: '0.00',
      };
    }
    return {
      variantId: row.variantId,
      found: true,
      variantActive: row.variantActive,
      productActive: row.productStatus === 'active' && isReachable(row.categoryId),
      stockQuantity: row.stockQuantity,
      lowStockThreshold: row.lowStockThreshold,
      currentPrice: row.currentPrice,
    };
  });
}
