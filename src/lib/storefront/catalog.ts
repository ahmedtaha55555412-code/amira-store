/**
 * Amira Store — storefront catalog read service (PHASE-05 tasks 2–10).
 *
 * READ-ONLY, PUBLIC service behind the storefront pages (and future public
 * APIs): active categories + products only, active variants only for
 * price/stock aggregates. Nothing here mutates data; admin flows stay in
 * `src/lib/catalog/*` (PHASE-04).
 *
 * Storefront visibility rules (documented for the integration gate):
 * - a product is visible iff `status = 'active'` AND its category (and every
 *   ancestor) is active — an active child under an inactive parent is treated
 *   as unreachable (the navigation never shows the branch);
 * - a product with ZERO active variants is excluded from listings/search (no
 *   meaningful price to show); products with zero-STOCK variants DO appear
 *   (honest "نفدت الكمية" state) — MASTER_PLAN §4/UX states;
 * - price/stock aggregates consider ACTIVE variants only (MASTER_PLAN §7:
 *   the variant is the pricing source of truth).
 *
 * Search (tasks 6–8): Arabic-aware normalization (src/lib/storefront/arabic.ts)
 * over product name, short/full description, variant SKU, category names and
 * attribute values, with exact > prefix > substring ranking and a pg_trgm
 * fuzzy tier (migration 0001) that degrades gracefully when the extension is
 * absent. The service is the only search entry point so a dedicated engine can
 * replace it later without touching UI contracts (MASTER_PLAN §19).
 */

import { and, asc, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  attributeValues,
  attributes,
  categories,
  mediaAssets,
  productImages,
  productVariants,
  products,
  reviews,
  sizeGuideRows,
  sizeGuides,
  variantAttributeValues,
  type Category,
} from '@/db/schema';
import {
  escapeLikePattern,
  normalizeArabic,
  normalizeSqlExpr,
} from './arabic';

/* -------------------------------------------------------------------------- */
/* Shared types                                                                */
/* -------------------------------------------------------------------------- */

export type StorefrontSort = 'newest' | 'price-asc' | 'price-desc' | 'name' | 'discount';

/** Card-shaped projection used by listings, search results and homepage sections. */
export type StorefrontProductCard = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  categoryName: string;
  categorySlug: string;
  /** Min/max current price across ACTIVE variants (numeric strings). */
  priceMin: string | null;
  priceMax: string | null;
  totalStock: number;
  /** Strongest discount among active discounted variants (0 = none). */
  maxDiscountPercent: number;
  /** Any active variant currently in stock. */
  inStock: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  createdAt: Date;
};

export type StorefrontPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/* -------------------------------------------------------------------------- */
/* Category tree + navigation (tasks 1–2)                                      */
/* -------------------------------------------------------------------------- */

export type StorefrontCategoryNode = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Active products in this category AND all its active descendants. */
  productCount: number;
  children: StorefrontCategoryNode[];
};

/** Active-only category tree with rolled-up active-product counts. */
export async function getStorefrontCategoryTree(): Promise<StorefrontCategoryNode[]> {
  const rows = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const counts = await db
    .select({
      categoryId: products.categoryId,
      n: sql<number>`count(*)::int`,
    })
    .from(products)
    .where(eq(products.status, 'active'))
    .groupBy(products.categoryId);

  const ownCount = new Map<string, number>();
  for (const row of counts) ownCount.set(row.categoryId, row.n);

  const byId = new Map<string, StorefrontCategoryNode>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      productCount: ownCount.get(row.id) ?? 0,
      children: [],
    });
  }

  const roots: StorefrontCategoryNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    if (row.parentId && byId.has(row.parentId)) {
      byId.get(row.parentId)!.children.push(node);
    } else if (row.parentId === null) {
      roots.push(node);
    }
  }

  // Roll subtree counts up to parents (post-order DFS).
  const accumulate = (node: StorefrontCategoryNode): number => {
    const total =
      node.productCount + node.children.reduce((sum, child) => sum + accumulate(child), 0);
    node.productCount = total;
    return total;
  };
  for (const root of roots) accumulate(root);

  return roots;
}

/* -------------------------------------------------------------------------- */
/* Category page data (tasks 2–3, 9)                                           */
/* -------------------------------------------------------------------------- */

export type StorefrontCategoryPage = {
  category: Category;
  /** Root → … → direct parent (active chain). */
  ancestors: Category[];
  children: Category[];
  /** The category + all active descendant ids (subtree listing scope). */
  subtreeIds: string[];
};

export async function getStorefrontCategoryPage(
  slug: string,
): Promise<StorefrontCategoryPage | null> {
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.slug, slug), eq(categories.isActive, true)))
    .limit(1);
  if (!category) return null;

  // Active ancestor chain — the branch must be fully reachable.
  const ancestors: Category[] = [];
  let parentId = category.parentId;
  while (parentId) {
    const [parent] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, parentId), eq(categories.isActive, true)))
      .limit(1);
    if (!parent) return null; // an inactive ancestor makes this branch unreachable
    ancestors.unshift(parent);
    parentId = parent.parentId;
  }

  const children = await db
    .select()
    .from(categories)
    .where(and(eq(categories.parentId, category.id), eq(categories.isActive, true)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  // Active descendants (BFS over active rows).
  const subtreeIds: string[] = [category.id];
  const queue = [category.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const kids = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.parentId, current), eq(categories.isActive, true)));
    for (const kid of kids) {
      subtreeIds.push(kid.id);
      queue.push(kid.id);
    }
  }

  return { category, ancestors, children, subtreeIds };
}

/* -------------------------------------------------------------------------- */
/* Listing with filters + sorting + pagination (tasks 4, 9, 10)                */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE_DEFAULT = 12;

const priceMinExpr = sql<string | null>`(select min(${productVariants.currentPrice}) from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.isActive} = true)`;
const priceMaxExpr = sql<string | null>`(select max(${productVariants.currentPrice}) from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.isActive} = true)`;
const totalStockExpr = sql<number>`(select coalesce(sum(${productVariants.stockQuantity}), 0)::int from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.isActive} = true)`;
const inStockExpr = sql<boolean>`(select exists(select 1 from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.isActive} = true and ${productVariants.stockQuantity} > 0))`;
const maxDiscountExpr = sql<number>`(select coalesce(max(round((1 - ${productVariants.currentPrice} / ${productVariants.originalPrice}) * 100)), 0)::int from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.isActive} = true and ${productVariants.currentPrice} < ${productVariants.originalPrice})`;
const hasActiveVariantExpr = sql<boolean>`(select exists(select 1 from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.isActive} = true))`;

export type ListStorefrontProductsOptions = {
  /** Category subtree scope (already resolved active ids). */
  categoryIds?: string[];
  /**
   * Faceted attribute filter: for EVERY selected attribute group the product
   * must have an active variant carrying one of that group's selected values
   * (single-variant semantics for multi-group selections — how shoppers
   * combine size + color).
   */
  attributeValueIdsByAttribute?: Record<string, string[]>;
  onSale?: boolean;
  inStockOnly?: boolean;
  /** Price range on the product's current-price span (range overlap). */
  priceMin?: number;
  priceMax?: number;
  sort?: StorefrontSort;
  page?: number;
  pageSize?: number;
};

export async function listStorefrontProducts(
  options: ListStorefrontProductsOptions = {},
): Promise<StorefrontPage<StorefrontProductCard>> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = Math.min(48, Math.max(1, Math.floor(options.pageSize ?? PAGE_SIZE_DEFAULT)));
  const sort = options.sort ?? 'newest';

  const conditions: SQL[] = [eq(products.status, 'active'), sql`${hasActiveVariantExpr}`];

  if (options.categoryIds && options.categoryIds.length > 0) {
    conditions.push(inArray(products.categoryId, options.categoryIds));
  }

  const groupEntries = Object.entries(options.attributeValueIdsByAttribute ?? {}).filter(
    ([, valueIds]) => valueIds.length > 0,
  );
  for (const [, valueIds] of groupEntries) {
    conditions.push(
      sql`exists(
        select 1 from ${productVariants}
        join ${variantAttributeValues} on ${variantAttributeValues.variantId} = ${productVariants.id}
        where ${productVariants.productId} = ${products.id}
          and ${productVariants.isActive} = true
          and ${inArray(variantAttributeValues.attributeValueId, valueIds)}
      )`,
    );
  }

  if (options.onSale) {
    conditions.push(
      sql`exists(
        select 1 from ${productVariants}
        where ${productVariants.productId} = ${products.id}
          and ${productVariants.isActive} = true
          and ${productVariants.currentPrice} < ${productVariants.originalPrice}
      )`,
    );
  }

  if (options.inStockOnly) {
    conditions.push(sql`${inStockExpr}`);
  }

  if (typeof options.priceMin === 'number' && Number.isFinite(options.priceMin)) {
    // Range-overlap semantics: product [min,max] overlaps shopper [lo,hi]
    // iff productMin <= hi AND productMax >= lo.
    conditions.push(sql`${priceMaxExpr} >= ${options.priceMin}`);
  }
  if (typeof options.priceMax === 'number' && Number.isFinite(options.priceMax)) {
    conditions.push(sql`${priceMinExpr} <= ${options.priceMax}`);
  }

  const where = and(...conditions);

  const orderBy: SQL[] = [];
  switch (sort) {
    case 'price-asc':
      orderBy.push(sql`${priceMinExpr} asc nulls last`);
      break;
    case 'price-desc':
      orderBy.push(sql`${priceMaxExpr} desc nulls last`);
      break;
    case 'name':
      orderBy.push(sql`${products.name} asc`);
      break;
    case 'discount':
      orderBy.push(sql`${maxDiscountExpr} desc nulls last`);
      break;
    case 'newest':
    default:
      orderBy.push(sql`${products.createdAt} desc`);
      break;
  }
  orderBy.push(sql`${products.id} asc`); // stable pagination tiebreaker

  const [{ n: total }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(where);

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      shortDescription: products.shortDescription,
      categoryName: categories.name,
      categorySlug: categories.slug,
      priceMin: priceMinExpr,
      priceMax: priceMaxExpr,
      totalStock: totalStockExpr,
      inStock: inStockExpr,
      maxDiscountPercent: maxDiscountExpr,
      createdAt: products.createdAt,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = await withPrimaryImages(rows);

  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

type ListingRow = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  categoryName: string;
  categorySlug: string;
  priceMin: string | null;
  priceMax: string | null;
  totalStock: number;
  inStock: boolean;
  maxDiscountPercent: number;
  createdAt: Date;
};

/** Attach the primary gallery image per product (one batched query). */
async function withPrimaryImages(rows: ListingRow[]): Promise<StorefrontProductCard[]> {
  const ids = rows.map((row) => row.id);
  const primaryByProduct = new Map<string, { url: string; alt: string | null }>();
  if (ids.length > 0) {
    const primaries = await db
      .select({
        productId: productImages.productId,
        url: mediaAssets.url,
        altText: mediaAssets.altText,
        sortOrder: productImages.sortOrder,
      })
      .from(productImages)
      .innerJoin(mediaAssets, eq(productImages.mediaAssetId, mediaAssets.id))
      .where(
        and(
          inArray(productImages.productId, ids),
          eq(productImages.isPrimary, true),
          sql`${productImages.variantId} is null`,
        ),
      )
      .orderBy(asc(productImages.sortOrder));
    for (const row of primaries) {
      if (!primaryByProduct.has(row.productId)) {
        primaryByProduct.set(row.productId, { url: row.url, alt: row.altText });
      }
    }
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.shortDescription,
    categoryName: row.categoryName,
    categorySlug: row.categorySlug,
    priceMin: row.priceMin,
    priceMax: row.priceMax,
    totalStock: row.totalStock,
    inStock: row.inStock,
    maxDiscountPercent: row.maxDiscountPercent,
    imageUrl: primaryByProduct.get(row.id)?.url ?? null,
    imageAlt: primaryByProduct.get(row.id)?.alt ?? null,
    createdAt: row.createdAt,
  }));
}

/* -------------------------------------------------------------------------- */
/* Dynamic category facets (task 9)                                            */
/* -------------------------------------------------------------------------- */

export type StorefrontFacets = {
  priceMin: string | null;
  priceMax: string | null;
  attributes: Array<{
    id: string;
    name: string;
    values: Array<{ id: string; value: string; productCount: number }>;
  }>;
};

/**
 * Facets derive from the category subtree's ACTIVE products/variants only —
 * cosmetics categories surface volume/shade, clothing surfaces size/color.
 * Counts are over the whole subtree (stable while the shopper toggles
 * filters; per-selection recount is a PHASE_11 refinement).
 */
export async function getStorefrontFacets(categoryIds: string[]): Promise<StorefrontFacets> {
  if (categoryIds.length === 0) {
    return { priceMin: null, priceMax: null, attributes: [] };
  }

  // True category-wide price span: min-of-mins / max-of-maxes across the
  // active variants of every active product in scope (a single-row probe was
  // wrong — caught by verify-storefront [7]).
  const [priceRange] = await db
    .select({
      priceMin: sql<string | null>`min(${productVariants.currentPrice})`,
      priceMax: sql<string | null>`max(${productVariants.currentPrice})`,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        eq(productVariants.isActive, true),
        eq(products.status, 'active'),
        inArray(products.categoryId, categoryIds),
      ),
    );

  const valueRows = await db
    .select({
      attributeId: attributes.id,
      attributeName: attributes.name,
      attributeSort: attributes.sortOrder,
      valueId: attributeValues.id,
      value: attributeValues.value,
      valueSort: attributeValues.sortOrder,
      productCount: sql<number>`count(distinct ${products.id})::int`,
    })
    .from(variantAttributeValues)
    .innerJoin(productVariants, eq(variantAttributeValues.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .innerJoin(attributeValues, eq(variantAttributeValues.attributeValueId, attributeValues.id))
    .innerJoin(attributes, eq(attributeValues.attributeId, attributes.id))
    .where(
      and(
        eq(productVariants.isActive, true),
        eq(products.status, 'active'),
        inArray(products.categoryId, categoryIds),
        eq(attributes.isActive, true),
      ),
    )
    .groupBy(
      attributes.id,
      attributes.name,
      attributes.sortOrder,
      attributeValues.id,
      attributeValues.value,
      attributeValues.sortOrder,
    )
    .orderBy(asc(attributes.sortOrder), asc(attributeValues.sortOrder), asc(attributeValues.value));

  const attributeMap = new Map<string, StorefrontFacets['attributes'][number]>();
  for (const row of valueRows) {
    let attribute = attributeMap.get(row.attributeId);
    if (!attribute) {
      attribute = { id: row.attributeId, name: row.attributeName, values: [] };
      attributeMap.set(row.attributeId, attribute);
    }
    attribute.values.push({
      id: row.valueId,
      value: row.value,
      productCount: row.productCount,
    });
  }

  return {
    priceMin: priceRange?.priceMin ?? null,
    priceMax: priceRange?.priceMax ?? null,
    attributes: [...attributeMap.values()],
  };
}

/* -------------------------------------------------------------------------- */
/* Product page aggregate (tasks 11–13)                                        */
/* -------------------------------------------------------------------------- */

export type StorefrontProductVariant = {
  id: string;
  sku: string;
  originalPrice: string;
  currentPrice: string;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
  assignments: Array<{ attributeId: string; valueId: string }>;
};

export type StorefrontProductImage = {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

export type StorefrontProductDetail = {
  product: {
    id: string;
    name: string;
    slug: string;
    shortDescription: string | null;
    description: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    canonicalSlug: string | null;
    createdAt: Date;
  };
  category: { id: string; name: string; slug: string };
  ancestors: Array<{ id: string; name: string; slug: string }>;
  /** Attribute groups used by the product's variants (display order). */
  attributes: Array<{
    id: string;
    name: string;
    values: Array<{ id: string; value: string }>;
  }>;
  variants: StorefrontProductVariant[];
  gallery: StorefrontProductImage[];
  /** Variant-specific images keyed by variant id (display order). */
  variantImages: Record<string, StorefrontProductImage[]>;
  sizeGuide: {
    title: string | null;
    notes: string | null;
    rows: Array<{ id: string; sizeLabel: string; measurements: Record<string, string>; sortOrder: number }>;
  } | null;
  reviews: {
    items: Array<{
      id: string;
      rating: number;
      comment: string;
      isVerifiedPurchase: boolean;
      createdAt: Date;
      imageUrl: string | null;
    }>;
    average: number | null;
    count: number;
  };
};

export async function getStorefrontProductDetail(
  slug: string,
): Promise<StorefrontProductDetail | null> {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, 'active')))
    .limit(1);
  if (!product) return null;

  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, product.categoryId), eq(categories.isActive, true)))
    .limit(1);
  if (!category) return null;

  const ancestors: Array<{ id: string; name: string; slug: string }> = [];
  let parentId = category.parentId;
  while (parentId) {
    const [parent] = await db.select().from(categories).where(eq(categories.id, parentId)).limit(1);
    if (!parent || !parent.isActive) return null; // unreachable branch
    ancestors.unshift({ id: parent.id, name: parent.name, slug: parent.slug });
    parentId = parent.parentId;
  }

  // Variants (ALL — inactive ones drive the honest "غير متاح" selector state).
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, product.id))
    .orderBy(asc(productVariants.createdAt), asc(productVariants.id));

  const assignments = variantRows.length
    ? await db
        .select({
          variantId: variantAttributeValues.variantId,
          attributeId: variantAttributeValues.attributeId,
          valueId: variantAttributeValues.attributeValueId,
          attributeName: attributes.name,
          attributeSort: attributes.sortOrder,
          value: attributeValues.value,
          valueSort: attributeValues.sortOrder,
        })
        .from(variantAttributeValues)
        .innerJoin(productVariants, eq(variantAttributeValues.variantId, productVariants.id))
        .innerJoin(attributeValues, eq(variantAttributeValues.attributeValueId, attributeValues.id))
        .innerJoin(attributes, eq(variantAttributeValues.attributeId, attributes.id))
        .where(inArray(variantAttributeValues.variantId, variantRows.map((v) => v.id)))
        .orderBy(asc(attributes.sortOrder), asc(attributeValues.sortOrder))
    : [];

  const assignmentsByVariant = new Map<string, StorefrontProductVariant['assignments']>();
  for (const row of assignments) {
    const list = assignmentsByVariant.get(row.variantId) ?? [];
    list.push({ attributeId: row.attributeId, valueId: row.valueId });
    assignmentsByVariant.set(row.variantId, list);
  }

  // Attribute groups in display order (deduplicated).
  const attributeMap = new Map<string, { id: string; name: string; values: Array<{ id: string; value: string }> }>();
  for (const row of assignments) {
    let attribute = attributeMap.get(row.attributeId);
    if (!attribute) {
      attribute = { id: row.attributeId, name: row.attributeName, values: [] };
      attributeMap.set(row.attributeId, attribute);
    }
    if (!attribute.values.some((v) => v.id === row.valueId)) {
      attribute.values.push({ id: row.valueId, value: row.value });
    }
  }

  // Images: product-level gallery + variant-level images.
  const imageRows = await db
    .select({
      id: productImages.id,
      variantId: productImages.variantId,
      url: mediaAssets.url,
      alt: mediaAssets.altText,
      isPrimary: productImages.isPrimary,
      sortOrder: productImages.sortOrder,
    })
    .from(productImages)
    .innerJoin(mediaAssets, eq(productImages.mediaAssetId, mediaAssets.id))
    .where(eq(productImages.productId, product.id))
    .orderBy(asc(productImages.sortOrder), asc(productImages.id));

  const gallery: StorefrontProductImage[] = [];
  const variantImages: Record<string, StorefrontProductImage[]> = {};
  for (const row of imageRows) {
    const image = {
      id: row.id,
      url: row.url,
      alt: row.alt,
      isPrimary: row.isPrimary,
      sortOrder: row.sortOrder,
    };
    if (row.variantId) {
      (variantImages[row.variantId] ??= []).push(image);
    } else {
      gallery.push(image);
    }
  }

  // Optional size guide.
  const [guide] = await db
    .select()
    .from(sizeGuides)
    .where(eq(sizeGuides.productId, product.id))
    .limit(1);
  let sizeGuide: StorefrontProductDetail['sizeGuide'] = null;
  if (guide) {
    const guideRows = await db
      .select()
      .from(sizeGuideRows)
      .where(eq(sizeGuideRows.sizeGuideId, guide.id))
      .orderBy(asc(sizeGuideRows.sortOrder), asc(sizeGuideRows.id));
    sizeGuide = {
      title: guide.title,
      notes: guide.notes,
      rows: guideRows.map((row) => ({
        id: row.id,
        sizeLabel: row.sizeLabel,
        measurements: (row.measurements ?? {}) as Record<string, string>,
        sortOrder: row.sortOrder,
      })),
    };
  }

  // Approved reviews only (moderation gate, MASTER_PLAN §15). PHASE-09:
  // the optional customer image rides along — approved reviews carry PUBLIC
  // assets only (private originals are disclosed at approval time), so the
  // access_mode filter below is defense-in-depth, not the primary gate.
  // NOTE: the correlated reference is written as a FULLY-QUALIFIED static
  // identifier — in a single-table select drizzle renders `${reviews.id}` as
  // a bare `"id"`, which is ambiguous inside the subquery (42702).
  const reviewRows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      isVerifiedPurchase: reviews.isVerifiedPurchase,
      createdAt: reviews.createdAt,
      imageUrl: sql<string | null>`(
        select mi.url from review_images ri
        join media_assets mi on mi.id = ri.media_asset_id
        where ri.review_id = "reviews"."id" and mi.access_mode = 'public'
        order by ri.sort_order asc
        limit 1
      )`,
    })
    .from(reviews)
    .where(and(eq(reviews.productId, product.id), eq(reviews.status, 'approved')))
    .orderBy(desc(reviews.createdAt));
  const average =
    reviewRows.length > 0
      ? Math.round((reviewRows.reduce((sum, r) => sum + r.rating, 0) / reviewRows.length) * 10) / 10
      : null;

  return {
    product: {
      id: product.id,
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      description: product.description,
      metaTitle: product.metaTitle,
      metaDescription: product.metaDescription,
      canonicalSlug: product.canonicalSlug,
      createdAt: product.createdAt,
    },
    category: { id: category.id, name: category.name, slug: category.slug },
    ancestors,
    attributes: [...attributeMap.values()],
    variants: variantRows.map((row) => ({
      id: row.id,
      sku: row.sku,
      originalPrice: row.originalPrice,
      currentPrice: row.currentPrice,
      stockQuantity: row.stockQuantity,
      lowStockThreshold: row.lowStockThreshold,
      isActive: row.isActive,
      assignments: assignmentsByVariant.get(row.id) ?? [],
    })),
    gallery,
    variantImages,
    sizeGuide,
    reviews: { items: reviewRows, average, count: reviewRows.length },
  };
}

/* -------------------------------------------------------------------------- */
/* Indexed existence probes (ISSUE-045)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Cheap indexed existence probe for the product detail route. Awaited by the
 * page BEFORE any JSX is returned so `notFound()` can still commit a real
 * HTTP 404 — with the route-level `loading.tsx` removed, the streaming shell
 * does not flush until this resolves, while a mid-stream `notFound()` after a
 * Suspense flush would be locked into a soft-404 (200). Mirrors the cheap
 * null-conditions of the aggregate loader (active product + active direct
 * category, both slug/PK-indexed); deeper ancestor mutations remain guarded by
 * the aggregate's own `notFound()` defense-in-depth.
 */
export async function hasStorefrontProductBySlug(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .innerJoin(
      categories,
      and(eq(categories.id, products.categoryId), eq(categories.isActive, true)),
    )
    .where(and(eq(products.slug, slug), eq(products.status, 'active')))
    .limit(1);
  return row !== undefined;
}

/**
 * Cheap indexed existence probe for the category listing route (see
 * {@link hasStorefrontProductBySlug}) — active category by its unique slug.
 */
export async function hasStorefrontCategoryBySlug(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.slug, slug), eq(categories.isActive, true)))
    .limit(1);
  return row !== undefined;
}

/* -------------------------------------------------------------------------- */
/* Arabic-aware search (tasks 5–8)                                             */
/* -------------------------------------------------------------------------- */

export type SearchMatchedCategory = { id: string; name: string; slug: string };

export type StorefrontSearchResult = StorefrontPage<StorefrontProductCard> & {
  matchedCategories: SearchMatchedCategory[];
};

const FUZZY_SIMILARITY_THRESHOLD = 0.35;

function buildSearchMatchCondition(normalizedQuery: string, fuzzyEnabled: boolean): SQL[] {
  const pattern = `%${escapeLikePattern(normalizedQuery)}%`;
  const prefixPattern = `${escapeLikePattern(normalizedQuery)}%`;

  const conditions: SQL[] = [
    like(normalizeSqlExpr(products.name), pattern),
    like(normalizeSqlExpr(products.shortDescription), pattern),
    like(normalizeSqlExpr(products.description), pattern),
    // Category names (the product's own category).
    like(normalizeSqlExpr(categories.name), pattern),
    // Variant SKUs (Latin — normalization lowercases).
    sql`exists(
      select 1 from ${productVariants}
      where ${productVariants.productId} = ${products.id}
        and ${normalizeSqlExpr(productVariants.sku)} like ${pattern}
    )`,
    // Attribute values (size/color/volume/shade names).
    sql`exists(
      select 1 from ${productVariants}
      join ${variantAttributeValues} on ${variantAttributeValues.variantId} = ${productVariants.id}
      join ${attributeValues} on ${attributeValues.id} = ${variantAttributeValues.attributeValueId}
      where ${productVariants.productId} = ${products.id}
        and ${productVariants.isActive} = true
        and ${normalizeSqlExpr(attributeValues.value)} like ${pattern}
    )`,
  ];

  if (fuzzyEnabled) {
    // Typo-tolerant tier (pg_trgm): WHOLE-WORD similarity against the raw
    // query — catches single-character typos in words of 5+ letters and
    // vowel-form mistakes (e.g. مرطاب → مرطب, كلسيك → كلاسيك). Chosen after
    // measuring the noise floor: nonsense queries score ≤ 0.25 while real
    // typos in 5+ letter words score ≥ 0.37. Known practical limit: a single
    // transposition inside a 4-letter word destroys most trigrams and may be
    // missed (documented in the PHASE-05 record).
    conditions.push(
      sql`strict_word_similarity(lower(${normalizedQuery}), lower(${products.name})) >= ${FUZZY_SIMILARITY_THRESHOLD}`,
    );
  }

  return conditions;
}

/**
 * Tiered Arabic-aware search: exact > prefix > substring across name,
 * descriptions, SKUs, category names and attribute values, with a pg_trgm
 * fuzzy tier. Falls back to non-fuzzy matching (with an honest error state
 * upstream) if the extension is unavailable.
 */
export async function searchStorefrontProducts(options: {
  query: string;
  categoryIds?: string[];
  sort?: StorefrontSort;
  page?: number;
  pageSize?: number;
}): Promise<StorefrontSearchResult> {
  const normalized = normalizeArabic(options.query);
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = Math.min(48, Math.max(1, Math.floor(options.pageSize ?? PAGE_SIZE_DEFAULT)));

  const matchedCategories = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(
      and(
        eq(categories.isActive, true),
        like(normalizeSqlExpr(categories.name), `%${escapeLikePattern(normalized)}%`),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name))
    .limit(4);

  const runQuery = async (fuzzyEnabled: boolean): Promise<{ rows: ListingRow[]; total: number; fuzzy: boolean }> => {
    const matchConditions = buildSearchMatchCondition(normalized, fuzzyEnabled);
    const conditions: SQL[] = [
      eq(products.status, 'active'),
      sql`${hasActiveVariantExpr}`,
      or(...matchConditions) as SQL,
    ];
    if (options.categoryIds && options.categoryIds.length > 0) {
      conditions.push(inArray(products.categoryId, options.categoryIds));
    }
    const where = and(...conditions);

    const sort = options.sort ?? 'newest';
    const orderBy: SQL[] = [];
    // Relevance first: exact name > name prefix > any other match; fuzzy
    // word-similarity breaks ties (and orders the fuzzy tier overall).
    orderBy.push(
      sql`case
        when ${normalizeSqlExpr(products.name)} = ${normalized} then 100
        when ${normalizeSqlExpr(products.name)} like ${`${escapeLikePattern(normalized)}%`} then 80
        else 50
      end desc`,
    );
    if (fuzzyEnabled) {
      orderBy.push(
        sql`strict_word_similarity(lower(${normalized}), lower(${products.name})) desc nulls last`,
      );
    }
    switch (sort) {
      case 'price-asc':
        orderBy.push(sql`${priceMinExpr} asc nulls last`);
        break;
      case 'price-desc':
        orderBy.push(sql`${priceMaxExpr} desc nulls last`);
        break;
      case 'name':
        orderBy.push(sql`${products.name} asc`);
        break;
      default:
        orderBy.push(sql`${products.createdAt} desc`);
        break;
    }
    orderBy.push(sql`${products.id} asc`);

    const rows = await db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        shortDescription: products.shortDescription,
        categoryName: categories.name,
        categorySlug: categories.slug,
        priceMin: priceMinExpr,
        priceMax: priceMaxExpr,
        totalStock: totalStockExpr,
        inStock: inStockExpr,
        maxDiscountPercent: maxDiscountExpr,
        createdAt: products.createdAt,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ n: total }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where);

    return { rows, total, fuzzy: fuzzyEnabled };
  };

  let result: { rows: ListingRow[]; total: number; fuzzy: boolean };
  try {
    result = await runQuery(true);
  } catch (error) {
    // Graceful degradation when pg_trgm is unavailable (undefined_function).
    const code = (error as { code?: string }).code;
    if (code === '42883') {
      result = await runQuery(false);
    } else {
      throw error;
    }
  }

  const items = await withPrimaryImages(result.rows);

  return {
    items,
    total: result.total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
    matchedCategories,
  };
}

/** Header autocomplete payload (task 5): top product + category suggestions. */
export async function getSearchSuggestions(query: string): Promise<{
  products: Array<{ slug: string; name: string; priceMin: string | null; imageUrl: string | null }>;
  categories: SearchMatchedCategory[];
}> {
  const normalized = normalizeArabic(query);
  if (normalized.length < 2) {
    return { products: [], categories: [] };
  }

  const search = await searchStorefrontProducts({ query, pageSize: 6 });
  return {
    products: search.items.map((item) => ({
      slug: item.slug,
      name: item.name,
      priceMin: item.priceMin,
      imageUrl: item.imageUrl,
    })),
    categories: search.matchedCategories,
  };
}

/* -------------------------------------------------------------------------- */
/* Homepage data (MASTER_PLAN §4 — data-driven, no manual selection)           */
/* -------------------------------------------------------------------------- */

export type StorefrontHomepageData = {
  newArrivals: StorefrontProductCard[];
  offers: StorefrontProductCard[];
  categoryTree: StorefrontCategoryNode[];
};

/**
 * وصل حديثًا = newest active products (real created_at — MASTER_PLAN §4);
 * العروض = products with genuinely discounted active variants, strongest
 * discount first (no featured/selected logic anywhere — MASTER_PLAN §2/§4).
 */
export async function getStorefrontHomepageData(): Promise<StorefrontHomepageData> {
  const [newArrivalsPage, offersPage, categoryTree] = await Promise.all([
    listStorefrontProducts({ sort: 'newest', pageSize: 8 }),
    listStorefrontProducts({ sort: 'discount', onSale: true, pageSize: 4 }),
    getStorefrontCategoryTree(),
  ]);

  return {
    newArrivals: newArrivalsPage.items,
    offers: offersPage.items,
    categoryTree,
  };
}

/** Shared guard for numeric query-string params. */
export function parsePriceParam(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
