/**
 * Amira Store — product editor shared state types (PHASE-04 UI).
 * Client-side state mirrors the aggregate API contract; the server remains
 * the sole validator (pricing/variants/media rules are re-checked there).
 */

export type EditorProduct = {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'active' | 'archived';
  categoryId: string;
  shortDescription: string | null;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

export type EditorVariant = {
  clientKey: string;
  id: string | null;
  sku: string;
  originalPrice: string;
  currentPrice: string;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
  /** attributeId → attributeValueId */
  values: Record<string, string>;
};

export type EditorImage = {
  key: string;
  mediaAssetId: string;
  /** 'product' = gallery; otherwise the clientKey of the owning variant. */
  level: string;
  altText: string;
  isPrimary: boolean;
  sortOrder: number;
  url: string;
};

export type EditorAttribute = {
  id: string;
  name: string;
  values: Array<{ id: string; value: string }>;
};

export type EditorMediaAsset = {
  id: string;
  url: string;
  mimeType: string;
  altText: string | null;
};

export type EditorSizeGuide = {
  title: string;
  notes: string;
  rows: Array<{ id: string; sizeLabel: string; bust: string; waist: string; length: string }>;
};

export const SIZE_GUIDE_MEASUREMENT_KEYS = ['bust', 'waist', 'length'] as const;

/** Serialize editor state into the aggregate PUT payload. */
export function buildPayload(input: {
  product: EditorProduct;
  attributeIds: string[];
  variants: EditorVariant[];
  images: EditorImage[];
  sizeGuide: EditorSizeGuide | null;
}) {
  return {
    name: input.product.name,
    slug: input.product.slug,
    categoryId: input.product.categoryId,
    shortDescription: input.product.shortDescription,
    description: input.product.description,
    metaTitle: input.product.metaTitle,
    metaDescription: input.product.metaDescription,
    attributeIds: input.attributeIds,
    variants: input.variants.map((variant) => ({
      clientKey: variant.clientKey,
      id: variant.id,
      sku: variant.sku,
      originalPrice: variant.originalPrice,
      currentPrice: variant.currentPrice,
      stockQuantity: variant.stockQuantity,
      lowStockThreshold: variant.lowStockThreshold,
      isActive: variant.isActive,
      attributeValueIds: input.attributeIds
        .map((attributeId) => variant.values[attributeId])
        .filter((valueId): valueId is string => Boolean(valueId)),
    })),
    images: input.images.map((image) => ({
      mediaAssetId: image.mediaAssetId,
      level:
        image.level === 'product'
          ? ('product' as const)
          : { variantKey: image.level },
      altText: image.altText || null,
      isPrimary: image.isPrimary,
      sortOrder: image.sortOrder,
    })),
    sizeGuide:
      input.sizeGuide && input.sizeGuide.rows.length > 0
        ? {
            title: input.sizeGuide.title || null,
            notes: input.sizeGuide.notes || null,
            rows: input.sizeGuide.rows.map((row, index) => {
              const measurements: Record<string, string> = {};
              if (row.bust.trim()) measurements['bust'] = row.bust.trim();
              if (row.waist.trim()) measurements['waist'] = row.waist.trim();
              if (row.length.trim()) measurements['length'] = row.length.trim();
              return {
                sizeLabel: row.sizeLabel,
                measurements,
                sortOrder: index,
              };
            }),
          }
        : null,
  };
}
