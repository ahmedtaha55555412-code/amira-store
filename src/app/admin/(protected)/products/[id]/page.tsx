import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireAdminPage } from '@/lib/auth/guard';
import { getCategoryTree } from '@/lib/catalog/categories';
import { getProductAggregate } from '@/lib/catalog/products';
import { listAttributesWithValues } from '@/lib/catalog/attributes';
import { listMediaAssets } from '@/lib/media/registry';
import { isMediaUploadConfigured } from '@/lib/media/service';

import { ProductEditor } from './product-editor';

/**
 * Product editor (PHASE-04 tasks 2, 4–8, 12–14): basics, category, SEO,
 * explicit-variant editor, gallery/variant images, optional size guide.
 * All mutations are server-validated; the editor never computes prices.
 */

export const metadata: Metadata = {
  title: 'تحرير المنتج',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminProductEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [aggregate, tree, attributes, mediaAssets] = await Promise.all([
    getProductAggregate(id),
    getCategoryTree(true),
    listAttributesWithValues(),
    listMediaAssets(200),
  ]);
  if (!aggregate) notFound();

  const categories = flatten(tree);

  return (
    <ProductEditor
      aggregate={{
        product: {
          id: aggregate.product.id,
          name: aggregate.product.name,
          slug: aggregate.product.slug,
          status: aggregate.product.status,
          categoryId: aggregate.product.categoryId,
          shortDescription: aggregate.product.shortDescription,
          description: aggregate.product.description,
          metaTitle: aggregate.product.metaTitle,
          metaDescription: aggregate.product.metaDescription,
        },
        variants: aggregate.variants.map((variant) => ({
          clientKey: variant.id,
          id: variant.id,
          sku: variant.sku,
          originalPrice: variant.originalPrice,
          currentPrice: variant.currentPrice,
          stockQuantity: variant.stockQuantity,
          lowStockThreshold: variant.lowStockThreshold,
          isActive: variant.isActive,
          values: Object.fromEntries(
            variant.attributeValueIds.map((valueId) => {
              const owner = attributes.find((attribute) =>
                attribute.values.some((value) => value.id === valueId),
              );
              return [owner?.id ?? '', valueId];
            }),
          ),
        })),
        images: aggregate.images.map((image, index) => ({
          key: image.id,
          mediaAssetId: image.mediaAssetId,
          level: image.variantId ?? 'product',
          altText: image.altText ?? '',
          isPrimary: image.isPrimary,
          sortOrder: image.sortOrder,
          url: image.url,
        })),
        sizeGuide: aggregate.sizeGuide
          ? {
              title: aggregate.sizeGuide.title ?? '',
              notes: aggregate.sizeGuide.notes ?? '',
              rows: aggregate.sizeGuide.rows.map((row) => ({
                id: row.id,
                sizeLabel: row.sizeLabel,
                bust: row.measurements['bust'] ?? '',
                waist: row.measurements['waist'] ?? '',
                length: row.measurements['length'] ?? '',
              })),
            }
          : null,
      }}
      categories={categories}
      attributes={attributes.map((attribute) => ({
        id: attribute.id,
        name: attribute.name,
        values: attribute.values.map((value) => ({ id: value.id, value: value.value })),
      }))}
      mediaAssets={mediaAssets.map((asset) => ({
        id: asset.id,
        url: asset.url,
        mimeType: asset.mimeType,
        altText: asset.altText,
      }))}
      uploadConfigured={isMediaUploadConfigured()}
    />
  );
}

type TreeCategory = {
  id: string;
  name: string;
  children: TreeCategory[];
};

function flatten(tree: TreeCategory[]): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  const walk = (nodes: TreeCategory[], depth: number) => {
    for (const node of nodes) {
      out.push({ id: node.id, label: `${'— '.repeat(depth)}${node.name}` });
      walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return out;
}
