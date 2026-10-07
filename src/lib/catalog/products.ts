/**
 * Amira Store — product aggregate service (PHASE-04 tasks 2, 4–8, 11–14).
 *
 * The product is an aggregate: basics + category + SEO + status, an optional
 * set of generic attributes, EXPLICIT variants (no forced Cartesian matrix —
 * MASTER_PLAN §6), gallery/variant images, and an optional size guide.
 *
 * Hard business rules enforced here (on top of the DB constraints):
 * - every variant carries exactly ONE value per attribute the product uses —
 *   so two values of the same attribute on one variant are impossible
 *   (PHASE-04 task 6; also DB-enforced by UNIQUE(variant_id, attribute_id));
 * - two variants cannot carry the identical value combination;
 * - a product WITHOUT attributes has exactly one default variant;
 * - prices are validated server-side (never trusted from the client — §7);
 * - stock changes made by the editor append `manual_adjustment` ledger rows
 *   with before/after quantities (MASTER_PLAN §13 auditable ledger);
 * - variants referenced by orders or inventory movements are never deleted —
 *   they must be deactivated instead (RESTRICT FKs, honest Arabic error);
 * - media references are replaced wholesale inside the same transaction as
 *   the rest of the aggregate so no product_images row can dangle (task 11).
 */

import { and, asc, count, desc, eq, inArray, like, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  attributeValues,
  attributes,
  categories,
  inventoryMovements,
  mediaAssets,
  orderItems,
  productImages,
  productVariants,
  products,
  sizeGuideRows,
  sizeGuides,
  variantAttributeValues,
  type Product,
} from '@/db/schema';
import { recordAdminActivity } from '@/lib/auth/activity';
import { CategoryServiceError } from './categories';
import { parseVariantPricing, PricingValidationError } from './pricing';
import { isSlugValid, slugify } from './slug';

export class ProductServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'ProductServiceError';
    this.status = status;
  }
}

const MAX_VARIANTS_PER_PRODUCT = 100;
const MAX_IMAGES_PER_PRODUCT = 30;

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type VariantInput = {
  /** Stable editor-row key: the variant's uuid when it exists, "new:<n>" otherwise. */
  clientKey: string;
  /** Existing variant id, or null/undefined when the editor created this row. */
  id?: string | null;
  sku: string;
  originalPrice: unknown;
  currentPrice: unknown;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
  /** Exactly one value id per attribute the product uses, same order. */
  attributeValueIds: string[];
};

export type ProductImageInput = {
  mediaAssetId: string;
  /** 'product' = gallery image; a variant id = variant-specific image. */
  level: 'product' | { variantKey: string };
  altText?: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

export type SizeGuideRowInput = {
  sizeLabel: string;
  measurements: Record<string, string>;
  sortOrder: number;
};

export type ProductAggregateInput = {
  name: string;
  slug?: string | null;
  categoryId: string;
  shortDescription?: string | null;
  description?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  /** SEO canonical override (PHASE-12): null = canonical URL follows /product/{slug}. */
  canonicalSlug?: string | null;
  /** Attribute ids the product uses (ordered; may be empty = default variant only). */
  attributeIds: string[];
  variants: VariantInput[];
  images: ProductImageInput[];
  sizeGuide?: {
    title?: string | null;
    notes?: string | null;
    rows: SizeGuideRowInput[];
  } | null;
};

export type ProductAggregate = {
  product: Product;
  variants: Array<
    ProductAggregateVariantRow & { attributeValueIds: string[] }
  >;
  images: Array<{
    id: string;
    mediaAssetId: string;
    variantId: string | null;
    isPrimary: boolean;
    sortOrder: number;
    altText: string | null;
    url: string;
    width: number | null;
    height: number | null;
  }>;
  sizeGuide: {
    id: string;
    title: string | null;
    notes: string | null;
    rows: Array<{
      id: string;
      sizeLabel: string;
      measurements: Record<string, string>;
      sortOrder: number;
    }>;
  } | null;
};

type ProductAggregateVariantRow = {
  id: string;
  sku: string;
  originalPrice: string;
  currentPrice: string;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
};

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export type ProductListItem = Product & {
  categoryName: string;
  variantCount: number;
  totalStock: number;
  minCurrentPrice: string | null;
  maxCurrentPrice: string | null;
  hasDiscount: boolean;
  primaryImageUrl: string | null;
};

export async function listProducts(options: {
  status?: 'draft' | 'active' | 'archived' | 'all';
  categoryId?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ items: ProductListItem[]; total: number }> {
  const status = options.status ?? 'all';
  const search = options.search?.trim();

  const conditions: SQL[] = [];
  if (status !== 'all') conditions.push(eq(products.status, status));
  if (options.categoryId) conditions.push(eq(products.categoryId, options.categoryId));
  if (search) {
    const searchCondition = or(
      like(sql`lower(${products.name})`, `%${search.toLowerCase()}%`),
      like(sql`lower(${products.slug})`, `%${search.toLowerCase()}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ n: total }] = await db
    .select({ n: count() })
    .from(products)
    .where(where);

  const rows = await db
    .select({
      product: products,
      categoryName: categories.name,
      variantCount: sql<number>`(select count(*)::int from ${productVariants} where ${productVariants.productId} = ${products.id})`,
      totalStock: sql<number>`(select coalesce(sum(${productVariants.stockQuantity}), 0)::int from ${productVariants} where ${productVariants.productId} = ${products.id})`,
      minCurrentPrice: sql<string | null>`(select min(${productVariants.currentPrice}) from ${productVariants} where ${productVariants.productId} = ${products.id})`,
      maxCurrentPrice: sql<string | null>`(select max(${productVariants.currentPrice}) from ${productVariants} where ${productVariants.productId} = ${products.id})`,
      hasDiscount: sql<boolean>`(select exists(select 1 from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.isActive} = true and ${productVariants.currentPrice} < ${productVariants.originalPrice}))`,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(desc(products.updatedAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);

  // Primary gallery image per product (single extra query for the page).
  const ids = rows.map((row) => row.product.id);
  const primaryByProduct = new Map<string, string>();
  if (ids.length > 0) {
    const primaries = await db
      .select({
        productId: productImages.productId,
        url: mediaAssets.url,
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
      );
    for (const row of primaries) primaryByProduct.set(row.productId, row.url);
  }

  return {
    items: rows.map((row) => ({
      ...row.product,
      categoryName: row.categoryName,
      variantCount: row.variantCount,
      totalStock: row.totalStock,
      minCurrentPrice: row.minCurrentPrice,
      maxCurrentPrice: row.maxCurrentPrice,
      hasDiscount: row.hasDiscount,
      primaryImageUrl: primaryByProduct.get(row.product.id) ?? null,
    })),
    total,
  };
}

export async function getProductAggregate(id: string): Promise<ProductAggregate | null> {
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return null;

  const variantRows = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(asc(productVariants.createdAt));

  const assignments =
    variantRows.length > 0
      ? await db
          .select()
          .from(variantAttributeValues)
          .where(
            inArray(
              variantAttributeValues.variantId,
              variantRows.map((v) => v.id),
            ),
          )
      : [];

  const imageRows = await db
    .select({
      id: productImages.id,
      mediaAssetId: productImages.mediaAssetId,
      variantId: productImages.variantId,
      isPrimary: productImages.isPrimary,
      sortOrder: productImages.sortOrder,
      altText: productImages.altText,
      url: mediaAssets.url,
      width: mediaAssets.width,
      height: mediaAssets.height,
    })
    .from(productImages)
    .innerJoin(mediaAssets, eq(productImages.mediaAssetId, mediaAssets.id))
    .where(eq(productImages.productId, id))
    .orderBy(asc(productImages.sortOrder));

  const [guide] = await db.select().from(sizeGuides).where(eq(sizeGuides.productId, id)).limit(1);
  const guideRows = guide
    ? await db
        .select()
        .from(sizeGuideRows)
        .where(eq(sizeGuideRows.sizeGuideId, guide.id))
        .orderBy(asc(sizeGuideRows.sortOrder))
    : [];

  return {
    product,
    variants: variantRows.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      originalPrice: variant.originalPrice,
      currentPrice: variant.currentPrice,
      stockQuantity: variant.stockQuantity,
      lowStockThreshold: variant.lowStockThreshold,
      isActive: variant.isActive,
      attributeValueIds: assignments
        .filter((a) => a.variantId === variant.id)
        .map((a) => a.attributeValueId),
    })),
    images: imageRows,
    sizeGuide: guide
      ? {
          id: guide.id,
          title: guide.title,
          notes: guide.notes,
          rows: guideRows.map((row) => ({
            id: row.id,
            sizeLabel: row.sizeLabel,
            measurements: (row.measurements ?? {}) as Record<string, string>,
            sortOrder: row.sortOrder,
          })),
        }
      : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

function normalizeName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length < 2 || trimmed.length > 200) {
    throw new ProductServiceError('اسم المنتج يجب أن يكون بين ٢ و ٢٠٠ حرفًا.');
  }
  return trimmed;
}

export async function createProduct(
  input: { name: string; slug?: string | null; categoryId: string },
  adminUserId: string,
): Promise<Product> {
  const name = normalizeName(input.name);
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);
  if (!category) throw new CategoryServiceError('القسم غير موجود.', 404);

  const base = input.slug?.trim() ? slugify(input.slug) : slugify(name);
  if (!isSlugValid(base)) {
    throw new ProductServiceError('الرابط (slug) يجب أن يحتوي حروفًا أو أرقامًا فقط.');
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('amira:products:slug-namespace'))`);
    const existingRoutes = await tx
      .select({ slug: products.slug, canonicalSlug: products.canonicalSlug })
      .from(products);
    const occupiedSlugs = new Set(
      existingRoutes.flatMap((row) => [row.slug, row.canonicalSlug].filter((value): value is string => value !== null)),
    );
    let slug = base;
    for (let suffix = 2; occupiedSlugs.has(slug); suffix += 1) {
      const suffixText = `-${suffix}`;
      slug = `${base.slice(0, 120 - suffixText.length)}${suffixText}`;
    }

    const [row] = await tx
      .insert(products)
      .values({ name, slug, categoryId: input.categoryId, status: 'draft' })
      .returning();

    await recordAdminActivity(
      {
        adminUserId,
        action: 'catalog.product.created',
        entityType: 'product',
        entityId: row.id,
        metadata: { slug: row.slug },
      },
      tx,
    );
    return row;
  });
}

/** Status transition (draft/active/archived — soft-delete policy: archive, never hard-delete). */
export async function setProductStatus(
  id: string,
  status: 'draft' | 'active' | 'archived',
  adminUserId: string,
): Promise<Product> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: products.status })
      .from(products)
      .where(eq(products.id, id))
      .for('update')
      .limit(1);
    if (!existing) throw new ProductServiceError('المنتج غير موجود.', 404);

    if (status === 'active') {
      const [activeVariant] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(and(eq(productVariants.productId, id), eq(productVariants.isActive, true)))
        .limit(1);
      if (!activeVariant) {
        throw new ProductServiceError('لا يمكن تفعيل منتج دون متغير نشط واحد على الأقل.');
      }
    }

    const [row] = await tx
      .update(products)
      .set({ status, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    await recordAdminActivity(
      {
        adminUserId,
        action: 'catalog.product.status_changed',
        entityType: 'product',
        entityId: id,
        metadata: { from: existing.status, to: status },
      },
      tx,
    );
    return row;
  });
}

/**
 * Full aggregate save (transaction). The editor submits the COMPLETE desired
 * state; the service diffs and applies it atomically.
 */
export async function saveProductAggregate(
  productId: string,
  input: ProductAggregateInput,
  adminUserId: string,
): Promise<Product> {
  const name = normalizeName(input.name);
  const [existing] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!existing) throw new ProductServiceError('المنتج غير موجود.', 404);

  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);
  if (!category) throw new CategoryServiceError('القسم غير موجود.', 404);

  /* ---------------- attribute set validation ---------------- */
  const attributeIds = [...new Set(input.attributeIds)];
  if (attributeIds.length > 0) {
    const known = await db
      .select({ id: attributes.id })
      .from(attributes)
      .where(inArray(attributes.id, attributeIds));
    if (known.length !== attributeIds.length) {
      throw new ProductServiceError('أحد خصائص المنتج غير موجودة.');
    }
  }

  /* ---------------- variant validation ---------------- */
  if (input.variants.length === 0) {
    throw new ProductServiceError('يجب إضافة متغير واحد على الأقل (وحدة البيع).');
  }
  if (attributeIds.length === 0 && input.variants.length !== 1) {
    throw new ProductServiceError(
      'منتج بدون خصائص يقتصر على متغير افتراضي واحد فقط.',
    );
  }
  if (input.variants.length > MAX_VARIANTS_PER_PRODUCT) {
    throw new ProductServiceError(`الحد الأقصى ${MAX_VARIANTS_PER_PRODUCT} متغير للمنتج.`);
  }

  const clientKeys = new Set<string>();
  const submittedIds = new Set<string>();
  for (const variant of input.variants) {
    if (!variant.clientKey || clientKeys.has(variant.clientKey)) {
      throw new ProductServiceError('مفتاح متغير مكرر أو غير صالح في الطلب.');
    }
    clientKeys.add(variant.clientKey);
    if (variant.id) submittedIds.add(variant.id);
  }

  const valueIds = new Set<string>();
  for (const variant of input.variants) {
    for (const id of variant.attributeValueIds) valueIds.add(id);
  }
  const valueRows = valueIds.size
    ? await db
        .select({
          id: attributeValues.id,
          attributeId: attributeValues.attributeId,
        })
        .from(attributeValues)
        .where(inArray(attributeValues.id, [...valueIds]))
    : [];
  const valueById = new Map(valueRows.map((row) => [row.id, row]));

  const parsedVariants = input.variants.map((variant, index) => {
    const label = `المتغير ${index + 1}`;
    const sku = typeof variant.sku === 'string' ? variant.sku.trim().toUpperCase() : '';
    if (sku.length < 1 || sku.length > 80) {
      throw new ProductServiceError(`${label}: رمز SKU مطلوب (٨٠ حرفًا كحد أقصى).`);
    }

    let originalPrice: string;
    let currentPrice: string;
    try {
      ({ originalPrice, currentPrice } = parseVariantPricing({
        originalPrice: variant.originalPrice,
        currentPrice: variant.currentPrice,
      }));
    } catch (error) {
      if (error instanceof PricingValidationError) {
        throw new ProductServiceError(`${label}: ${error.message}`);
      }
      throw error;
    }

    const stockQuantity = Number(variant.stockQuantity);
    const lowStockThreshold = Number(variant.lowStockThreshold);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      throw new ProductServiceError(`${label}: المخزون يجب أن يكون عددًا صحيحًا غير سالب.`);
    }
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
      throw new ProductServiceError(`${label}: حد التنبيه يجب أن يكون عددًا صحيحًا غير سالب.`);
    }

    // Exactly one value per attribute; no unknown values; no duplicates of the
    // same attribute on one variant (task 6).
    const perVariantAttributes = new Set<string>();
    const resolvedValueIds: string[] = [];
    for (const valueId of variant.attributeValueIds) {
      const value = valueById.get(valueId);
      if (!value) throw new ProductServiceError(`${label}: قيمة خاصية غير موجودة.`);
      if (perVariantAttributes.has(value.attributeId)) {
        throw new ProductServiceError(
          `${label}: لا يمكن إسناد قيمتين من نفس الخاصية إلى متغير واحد.`,
        );
      }
      perVariantAttributes.add(value.attributeId);
      resolvedValueIds.push(valueId);
    }
    const missing = attributeIds.filter((id) => !perVariantAttributes.has(id));
    if (missing.length > 0) {
      throw new ProductServiceError(
        `${label}: كل متغير يحتاج قيمة لكل خاصية مستخدمة في المنتج.`,
      );
    }

    return {
      ...variant,
      sku,
      originalPrice,
      currentPrice,
      stockQuantity,
      lowStockThreshold,
      resolvedValueIds,
    };
  });

  // The editor submits the whole aggregate. Re-check the persisted product state
  // under the same transaction lock used for status changes, so an active product
  // can never be left with zero active variants by a stale concurrent save.

  // Duplicate combination detection (explicit variants only — task 4).
  const seenCombinations = new Map<string, number>();
  for (const [index, variant] of parsedVariants.entries()) {
    const key = [...variant.resolvedValueIds].sort().join('|');
    const firstIndex = seenCombinations.get(key);
    if (firstIndex !== undefined) {
      throw new ProductServiceError(
        `المتغير ${index + 1} يكرر نفس تركيبة الخصائص مع المتغير ${firstIndex + 1}.`,
      );
    }
    seenCombinations.set(key, index);
  }

  // Duplicate SKU within the submitted set (DB checks cross-product).
  const skuSet = new Set<string>();
  for (const variant of parsedVariants) {
    if (skuSet.has(variant.sku)) {
      throw new ProductServiceError(`رمز SKU مكرر داخل المنتج: ${variant.sku}`);
    }
    skuSet.add(variant.sku);
  }

  /* ---------------- image validation ---------------- */
  if (input.images.length > MAX_IMAGES_PER_PRODUCT) {
    throw new ProductServiceError(`الحد الأقصى ${MAX_IMAGES_PER_PRODUCT} صورة للمنتج.`);
  }
  const requestedAssetIds = [...new Set(input.images.map((image) => image.mediaAssetId))];
  const assetRows = requestedAssetIds.length
    ? await db
        .select({ id: mediaAssets.id, accessMode: mediaAssets.accessMode, pathname: mediaAssets.pathname })
        .from(mediaAssets)
        .where(inArray(mediaAssets.id, requestedAssetIds))
    : [];
  if (assetRows.length !== requestedAssetIds.length) {
    throw new ProductServiceError('إحدى الصور المرفقة غير موجودة في مكتبة الوسائط.');
  }
  const invalidProductMedia = assetRows.find(
    (asset) =>
      asset.accessMode !== 'public' ||
      asset.pathname.startsWith('reviews/') ||
      asset.pathname.startsWith('testimonials/'),
  );
  if (invalidProductMedia) {
    throw new ProductServiceError('صور المنتجات يجب أن تكون صورًا عامة من مكتبة المنتجات، ولا يجوز استخدام صور التقييمات أو واتساب.');
  }
  const keyedImages = input.images.map((image) => ({
    ...image,
    // Variant levels reference the editor's stable existing-variant id or the
    // submitted sku-based key of a NEW variant (resolved inside the transaction).
    variantRef: image.level === 'product' ? null : image.level.variantKey,
  }));
  const productPrimaryCount = input.images.filter(
    (image) => image.level === 'product' && image.isPrimary,
  ).length;
  if (productPrimaryCount > 1) {
    throw new ProductServiceError('صورة رئيسية واحدة فقط للمعرض.');
  }
  const variantPrimaryCounts = new Map<string, number>();
  for (const image of keyedImages) {
    if (image.variantRef && image.isPrimary) {
      variantPrimaryCounts.set(
        image.variantRef,
        (variantPrimaryCounts.get(image.variantRef) ?? 0) + 1,
      );
    }
  }
  for (const [key, n] of variantPrimaryCounts) {
    if (n > 1) {
      throw new ProductServiceError(`صورة رئيسية واحدة فقط لكل متغير (${key}).`);
    }
  }

  /* ---------------- size guide validation ---------------- */
  const sizeGuide = input.sizeGuide ?? null;
  if (sizeGuide && sizeGuide.rows.length > 50) {
    throw new ProductServiceError('الحد الأقصى ٥٠ صفًا لدليل المقاسات.');
  }

  /* ---------------- transactional apply ---------------- */
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('amira:products:slug-namespace'))`);
    const [lockedProduct] = await tx
      .select({ status: products.status, slug: products.slug, canonicalSlug: products.canonicalSlug })
      .from(products)
      .where(eq(products.id, productId))
      .for('update')
      .limit(1);
    if (!lockedProduct) throw new ProductServiceError('المنتج غير موجود.', 404);
    if (lockedProduct.status === 'active' && !parsedVariants.some((variant) => variant.isActive)) {
      throw new ProductServiceError('لا يمكن إبقاء منتج نشط بدون متغير نشط واحد على الأقل.');
    }

    /* product basics + slug */
    const base = input.slug?.trim() ? slugify(input.slug) : slugify(name);
    let slug = lockedProduct.slug;
    const existingRoutes = await tx
      .select({ id: products.id, slug: products.slug, canonicalSlug: products.canonicalSlug })
      .from(products)
      .where(ne(products.id, productId));
    const occupiedSlugs = new Set(
      existingRoutes.flatMap((row) => [row.slug, row.canonicalSlug].filter((value): value is string => value !== null)),
    );
    if (base !== lockedProduct.slug) {
      if (!isSlugValid(base)) {
        throw new ProductServiceError('الرابط (slug) يجب أن يحتوي حروفًا أو أرقامًا فقط.');
      }
      if (occupiedSlugs.has(base)) {
        throw new ProductServiceError('الرابط (slug) مستخدم بالفعل لمنتج آخر.');
      }
      slug = base;
    }

    /* canonical slug (PHASE-12): the SEO canonical override is editable
       end-to-end. Empty → null (canonical URL follows the product slug);
       otherwise it must be a valid slug and unused by any OTHER product
       (the storefront PDP renders <link rel=canonical> from this column —
       PHASE-11 SEO contract). */
    const canonicalInput = input.canonicalSlug?.trim() ? slugify(input.canonicalSlug) : null;
    if (canonicalInput !== null) {
      if (!isSlugValid(canonicalInput)) {
        throw new ProductServiceError(
          'الرابط الأساسي (canonical) يجب أن يحتوي حروفًا أو أرقامًا وشرطات فقط.',
        );
      }
      if (occupiedSlugs.has(canonicalInput)) {
        throw new ProductServiceError('الرابط الأساسي (canonical) مستخدم بالفعل لمنتج آخر.');
      }
    }

    const [product] = await tx
      .update(products)
      .set({
        name,
        slug,
        categoryId: input.categoryId,
        shortDescription: input.shortDescription?.trim() || null,
        description: input.description?.trim() || null,
        metaTitle: input.metaTitle?.trim() || null,
        metaDescription: input.metaDescription?.trim() || null,
        canonicalSlug: canonicalInput,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId))
      .returning();

    /* variants: diff old set vs new set — identity is the variant ID, so a
       SKU edit updates the same row (ledger/orders stay linked). */
    const existingVariants = await tx
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId));
    const existingById = new Map(existingVariants.map((row) => [row.id, row]));

    // Validate submitted ids actually belong to this product.
    for (const variant of parsedVariants) {
      if (variant.id && !existingById.has(variant.id)) {
        throw new ProductServiceError(`متغير غير معروف للمنتج (${variant.sku}).`);
      }
    }
    // Friendly SKU-conflict pre-check (the DB unique index is the hard guard).
    const skuByOther = new Map(
      existingVariants.filter((row) => !submittedIds.has(row.id)).map((row) => [row.sku, row]),
    );
    for (const variant of parsedVariants) {
      const owner = existingById.get(variant.id ?? '');
      if (!owner && skuByOther.has(variant.sku)) {
        throw new ProductServiceError(`رمز SKU مستخدم بالفعل: ${variant.sku}`);
      }
    }

    const removedVariants = existingVariants.filter((row) => !submittedIds.has(row.id));

    if (removedVariants.length > 0) {
      const removedIds = removedVariants.map((row) => row.id);
      const [orderRef] = await tx
        .select({ n: count() })
        .from(orderItems)
        .where(inArray(orderItems.variantId, removedIds));
      if ((orderRef?.n ?? 0) > 0) {
        throw new ProductServiceError(
          'لا يمكن حذف متغير مرتبط بطلبات. عطّل المتغير (غير نشط) بدلًا من حذفه.',
        );
      }
      const [ledgerRef] = await tx
        .select({ n: count() })
        .from(inventoryMovements)
        .where(inArray(inventoryMovements.variantId, removedIds));
      if ((ledgerRef?.n ?? 0) > 0) {
        throw new ProductServiceError(
          'لا يمكن حذف متغير له سجل مخزون. عطّل المتغير (غير نشط) بدلًا من حذفه.',
        );
      }
      // Cascade removes assignments + variant-level images (task 11: no orphans).
      await tx.delete(productVariants).where(inArray(productVariants.id, removedIds));
    }

    // Friendly foreign-SKU pre-check (the DB unique index remains the hard
    // guard): any submitted SKU currently owned by a variant OUTSIDE this
    // product's kept set belongs to another product.
    const keptIdsNow = parsedVariants
      .map((variant) => (variant.id ? existingById.get(variant.id)?.id : undefined))
      .filter((id): id is string => Boolean(id));
    const submittedSkus = parsedVariants.map((variant) => variant.sku);
    const foreignSkuRows = await tx
      .select({ sku: productVariants.sku })
      .from(productVariants)
      .where(
        and(
          inArray(productVariants.sku, submittedSkus),
          keptIdsNow.length > 0
            ? notInArray(productVariants.id, keptIdsNow)
            : undefined,
        ),
      );
    if (foreignSkuRows.length > 0) {
      throw new ProductServiceError(
        `رمز SKU مستخدم بالفعل: ${foreignSkuRows[0].sku}`,
      );
    }

    const finalIdByKey = new Map<string, string>(); // editor clientKey → variant id
    // Two passes: updates first, then inserts — so a SKU swap between rows
    // inside one save can never collide with a not-yet-updated row.
    for (const variant of parsedVariants) {
      const existingRow = variant.id ? existingById.get(variant.id) : undefined;
      if (!existingRow) continue;
      // Stock delta → auditable manual_adjustment movement (MASTER_PLAN §13).
      if (existingRow.stockQuantity !== variant.stockQuantity) {
        const delta = variant.stockQuantity - existingRow.stockQuantity;
        await tx.insert(inventoryMovements).values({
          variantId: existingRow.id,
          adminUserId,
          movementType: 'manual_adjustment',
          quantityDelta: delta,
          stockBefore: existingRow.stockQuantity,
          stockAfter: variant.stockQuantity,
          reason: 'variant_editor_save',
        });
      }
      await tx
        .update(productVariants)
        .set({
          sku: variant.sku,
          originalPrice: variant.originalPrice,
          currentPrice: variant.currentPrice,
          stockQuantity: variant.stockQuantity,
          lowStockThreshold: variant.lowStockThreshold,
          isActive: variant.isActive,
          updatedAt: new Date(),
        })
        .where(eq(productVariants.id, existingRow.id));
      finalIdByKey.set(variant.clientKey, existingRow.id);
    }
    for (const variant of parsedVariants) {
      if (variant.id && existingById.has(variant.id)) continue;
      const [created] = await tx
        .insert(productVariants)
        .values({
          productId,
          sku: variant.sku,
          originalPrice: variant.originalPrice,
          currentPrice: variant.currentPrice,
          stockQuantity: variant.stockQuantity,
          lowStockThreshold: variant.lowStockThreshold,
          isActive: variant.isActive,
        })
        .returning();
      if (variant.stockQuantity > 0) {
        await tx.insert(inventoryMovements).values({
          variantId: created.id,
          adminUserId,
          movementType: 'opening',
          quantityDelta: variant.stockQuantity,
          stockBefore: 0,
          stockAfter: variant.stockQuantity,
          reason: 'variant_editor_save',
        });
      }
      finalIdByKey.set(variant.clientKey, created.id);
    }

    /* assignments: rebuild per variant. Deletions above already cascaded the
       removed variants' assignments; the kept variants get a clean rebuild. */
    const keptIds = [...finalIdByKey.values()];
    if (keptIds.length > 0) {
      await tx
        .delete(variantAttributeValues)
        .where(inArray(variantAttributeValues.variantId, keptIds));
    }
    for (const variant of parsedVariants) {
      const variantId = finalIdByKey.get(variant.clientKey)!;
      if (variant.resolvedValueIds.length > 0) {
        await tx.insert(variantAttributeValues).values(
          variant.resolvedValueIds.map((valueId) => ({
            variantId,
            attributeValueId: valueId,
            attributeId: valueById.get(valueId)!.attributeId,
          })),
        );
      }
    }

    const unresolvedVariantImage = keyedImages.find(
      (image) => image.variantRef !== null && !finalIdByKey.has(image.variantRef),
    );
    if (unresolvedVariantImage) {
      throw new ProductServiceError('إحدى صور المتغيرات تشير إلى متغير غير موجود.');
    }

    /* images: replace wholesale (task 11 — one transaction, no orphans) */
    await tx.delete(productImages).where(eq(productImages.productId, productId));
    if (keyedImages.length > 0) {
      await tx.insert(productImages).values(
        keyedImages.map((image) => ({
          productId,
          variantId: image.variantRef === null ? null : finalIdByKey.get(image.variantRef)!,
          mediaAssetId: image.mediaAssetId,
          isPrimary: image.isPrimary,
          sortOrder: image.sortOrder,
          altText: image.altText?.trim() || null,
        })),
      );
    }

    /* size guide upsert */
    if (sizeGuide) {
      const [guide] = await tx
        .insert(sizeGuides)
        .values({
          productId,
          title: sizeGuide.title?.trim() || null,
          notes: sizeGuide.notes?.trim() || null,
        })
        .onConflictDoUpdate({
          target: sizeGuides.productId,
          set: {
            title: sizeGuide.title?.trim() || null,
            notes: sizeGuide.notes?.trim() || null,
          },
        })
        .returning();
      await tx.delete(sizeGuideRows).where(eq(sizeGuideRows.sizeGuideId, guide.id));
      if (sizeGuide.rows.length > 0) {
        await tx.insert(sizeGuideRows).values(
          sizeGuide.rows.map((row, index) => ({
            sizeGuideId: guide.id,
            sizeLabel: row.sizeLabel.trim(),
            measurements: row.measurements,
            sortOrder: row.sortOrder ?? index,
          })),
        );
      }
    } else {
      await tx.delete(sizeGuides).where(eq(sizeGuides.productId, productId));
    }

    await recordAdminActivity(
      {
        adminUserId,
        action: 'catalog.product.saved',
        entityType: 'product',
        entityId: productId,
        metadata: {
          variants: parsedVariants.length,
          images: keyedImages.length,
          attributes: attributeIds.length,
          hasSizeGuide: sizeGuide !== null,
        },
      },
      tx,
    );

    return product;
  });

  return result;
}
