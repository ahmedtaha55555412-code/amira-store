/**
 * Amira Store — DEVELOPMENT seed (PHASE-02).
 *
 * SEED_PLAN rules implemented here:
 * - deterministic and safe to re-run (upserts on natural keys — running twice
 *   never duplicates SKUs/categories/settings);
 * - dev/preview mode ONLY: refuses to run unless NODE_ENV === "development"
 *   (DoD: "seed works only in explicit dev/preview mode");
 * - NEVER seeds customers/orders/admin accounts (no fake orders anywhere);
 * - demo media clearly marked;
 * - content is representative of ALL five departments and demonstrates every
 *   allowed variant shape: no-attributes, size-only, color-only, size+color
 *   (explicit non-Cartesian subset), volume-only, volume+shade.
 *
 * Run: bun run db:seed
 */

import { asc, eq, inArray, sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import {
  attributeValues,
  attributes,
  categories,
  homepageSections,
  mediaAssets,
  productImages,
  productVariants,
  products,
  reviews,
  sizeGuideRows,
  sizeGuides,
  storeSettings,
  variantAttributeValues,
  whatsappTestimonials,
} from '../src/db/schema';

/* -------------------------------------------------------------------------- */
/* Mode guard                                                                  */
/* -------------------------------------------------------------------------- */

if (process.env.NODE_ENV !== 'development') {
  console.error(
    '[db-seed] REFUSED: development seed requires NODE_ENV=development.',
  );
  console.error(
    '[db-seed] Production must never receive demo data (docs/ops/SEED_PLAN.md).',
  );
  process.exit(1);
}

const DEMO_ALT = 'صورة تجريبية للعرض التطويري — استبدلها بمحتوى حقيقي';

/* -------------------------------------------------------------------------- */
/* 1. Store settings (singleton — WhatsApp number is DATA, not code)           */
/* -------------------------------------------------------------------------- */

const DEFAULT_WHATSAPP_TEMPLATE = [
  'مرحبًا {store_name} 👋',
  'أرغب في تأكيد طلبي رقم {order_number}.',
  '',
  '{items}',
  '',
  'إجمالي المنتجات: {products_total} جنيه',
  'طريقة الدفع: {payment_method}',
  'الاسم: {customer_name}',
  'العنوان: {address}',
  'برجاء الاتفاق على تكلفة الشحن عبر واتساب.',
  'شكرًا لكم 🌸',
].join('\n');

const settingsRow = {
  id: 1,
  storeName: 'أميرة استور',
  whatsappPhone: '+201019003677',
  whatsappMessageTemplate: DEFAULT_WHATSAPP_TEMPLATE,
  currencyCode: 'EGP',
  locale: 'ar',
  timezone: 'Africa/Cairo',
  footerText: 'أميرة استور — كل العائلة في مكان واحد',
};

await db
  .insert(storeSettings)
  .values(settingsRow)
  .onConflictDoUpdate({
    target: storeSettings.id,
    set: {
      storeName: settingsRow.storeName,
      whatsappPhone: settingsRow.whatsappPhone,
      whatsappMessageTemplate: settingsRow.whatsappMessageTemplate,
      currencyCode: settingsRow.currencyCode,
      locale: settingsRow.locale,
      timezone: settingsRow.timezone,
      footerText: settingsRow.footerText,
      updatedAt: sql`now()`,
    },
  });
console.log('[db-seed] store_settings ✔ (WhatsApp +201019003677 as store data)');

/* -------------------------------------------------------------------------- */
/* 2. Categories — 5 departments + representative children                     */
/* -------------------------------------------------------------------------- */

const categoryTree = [
  { slug: 'women', name: 'نسائي', children: [
    { slug: 'women-dresses', name: 'فساتين' },
    { slug: 'women-abayas', name: 'عبايات وطرح' },
  ] },
  { slug: 'men', name: 'رجالي', children: [
    { slug: 'men-shirts', name: 'قمصان وتيشيرتات' },
  ] },
  { slug: 'kids', name: 'أطفال', children: [
    { slug: 'kids-girls', name: 'بناتي' },
    { slug: 'kids-boys', name: 'أولادي' },
  ] },
  { slug: 'baby', name: 'مواليد', children: [
    { slug: 'baby-clothing', name: 'ملابس مواليد' },
  ] },
  { slug: 'cosmetics', name: 'مستحضرات تجميل', children: [
    { slug: 'cosmetics-makeup', name: 'مكياج' },
    { slug: 'cosmetics-skincare', name: 'العناية بالبشرة' },
  ] },
] as const;

const categoryIds = new Map<string, string>();
for (const [i, node] of categoryTree.entries()) {
  const [row] = await db
    .insert(categories)
    .values({ slug: node.slug, name: node.name, sortOrder: i })
    .onConflictDoUpdate({
      target: categories.slug,
      set: { name: node.name, sortOrder: i, updatedAt: sql`now()` },
    })
    .returning({ id: categories.id });
  categoryIds.set(node.slug, row.id);

  for (const [j, child] of node.children.entries()) {
    const [childRow] = await db
      .insert(categories)
      .values({
        slug: child.slug,
        name: child.name,
        parentId: row.id,
        sortOrder: j,
      })
      .onConflictDoUpdate({
        target: categories.slug,
        set: { name: child.name, parentId: row.id, sortOrder: j, updatedAt: sql`now()` },
      })
      .returning({ id: categories.id });
    categoryIds.set(child.slug, childRow.id);
  }
}
console.log('[db-seed] categories ✔ (5 departments + children)');

/* -------------------------------------------------------------------------- */
/* 3. Generic attributes + values                                              */
/* -------------------------------------------------------------------------- */

const attributeDefs = [
  {
    slug: 'size',
    name: 'المقاس',
    values: [
      { slug: 's', value: 'S' },
      { slug: 'm', value: 'M' },
      { slug: 'l', value: 'L' },
      { slug: 'xl', value: 'XL' },
    ],
  },
  {
    slug: 'color',
    name: 'اللون',
    values: [
      { slug: 'black', value: 'أسود' },
      { slug: 'white', value: 'أبيض' },
      { slug: 'blush', value: 'وردي فاتح' },
      { slug: 'sky', value: 'أزرق سماوي' },
    ],
  },
  {
    slug: 'volume',
    name: 'الحجم',
    values: [
      { slug: '50ml', value: '50 مل' },
      { slug: '100ml', value: '100 مل' },
    ],
  },
  {
    slug: 'shade',
    name: 'الدرجة',
    values: [
      { slug: 'light', value: 'فاتح' },
      { slug: 'medium', value: 'متوسط' },
    ],
  },
] as const;

const attributeIds = new Map<string, string>();
const valueIds = new Map<string, string>(); // `${attrSlug}:${valueSlug}` -> id
for (const [i, attr] of attributeDefs.entries()) {
  const [attrRow] = await db
    .insert(attributes)
    .values({ slug: attr.slug, name: attr.name, sortOrder: i })
    .onConflictDoUpdate({
      target: attributes.slug,
      set: { name: attr.name, sortOrder: i },
    })
    .returning({ id: attributes.id });
  attributeIds.set(attr.slug, attrRow.id);

  for (const [j, val] of attr.values.entries()) {
    const [valRow] = await db
      .insert(attributeValues)
      .values({
        attributeId: attrRow.id,
        slug: val.slug,
        value: val.value,
        sortOrder: j,
      })
      .onConflictDoUpdate({
        target: [attributeValues.attributeId, attributeValues.slug],
        set: { value: val.value, sortOrder: j },
      })
      .returning({ id: attributeValues.id });
    valueIds.set(`${attr.slug}:${val.slug}`, valRow.id);
  }
}
console.log('[db-seed] attributes + values ✔ (size/color/volume/shade)');

/* -------------------------------------------------------------------------- */
/* 4. Demo media assets (clearly marked, deterministic pathnames)              */
/* -------------------------------------------------------------------------- */

const demoMediaSlugs = [
  'shirt', 'abaya', 'kids-tshirt', 'baby-towel', 'foundation', 'cream',
  'testimonial-1', 'testimonial-2',
];
const mediaIds = new Map<string, string>();
for (const slug of demoMediaSlugs) {
  const pathname = `demo/${slug}.svg`;
  // PHASE-05: distinct per-product placeholder assets so the storefront's
  // variant-image switching is visually verifiable in development QA
  // (previously every demo asset pointed at og-default.png).
  const url = `/brand/demo/${slug}.svg`;
  const [row] = await db
    .insert(mediaAssets)
    .values({
      provider: 'demo_seed',
      pathname,
      url,
      accessMode: 'public',
      mimeType: 'image/svg+xml',
      sizeBytes: 1_100,
      width: 800,
      height: 1000,
      altText: DEMO_ALT,
      metadata: { demo: true },
    })
    .onConflictDoUpdate({
      target: mediaAssets.pathname,
      set: { altText: DEMO_ALT, url },
    })
    .returning({ id: mediaAssets.id });
  mediaIds.set(slug, row.id);
}
console.log('[db-seed] demo media assets ✔');

/* -------------------------------------------------------------------------- */
/* 5. Products + variants (all verification-scenario shapes)                   */
/* -------------------------------------------------------------------------- */

type VariantSeed = {
  sku: string;
  originalPrice: string;
  currentPrice: string;
  stock: number;
  attrs: string[]; // `${attrSlug}:${valueSlug}` keys
  ownImage?: string; // media slug for variant-specific image
};

type ProductSeed = {
  slug: string;
  name: string;
  category: string;
  short: string;
  status: 'draft' | 'active' | 'archived';
  media: string[]; // gallery media slugs
  variants: VariantSeed[];
  sizeGuide?: { label: string; measurements: Record<string, string> }[];
};

const catalog: ProductSeed[] = [
  // (a) NO selectable attributes — default variant only.
  {
    slug: 'baby-cotton-towel',
    name: 'منشفة أطفال قطنية فائقة النعومة',
    category: 'baby-clothing',
    short: 'منشفة قطنية 100% لطيفة على بشرة المواليد',
    status: 'active',
    media: ['baby-towel'],
    variants: [
      { sku: 'AMR-BBT-001', originalPrice: '180.00', currentPrice: '149.00', stock: 25, attrs: [] },
    ],
  },
  // (b) SIZE-only.
  {
    slug: 'men-classic-shirt',
    name: 'قميص رجالي كلاسيك قطن',
    category: 'men-shirts',
    short: 'قميص قطني مريح بقصة كلاسيكية',
    status: 'active',
    media: ['shirt'],
    variants: [
      { sku: 'AMR-MCS-S', originalPrice: '420.00', currentPrice: '349.00', stock: 10, attrs: ['size:s'] },
      { sku: 'AMR-MCS-M', originalPrice: '420.00', currentPrice: '349.00', stock: 14, attrs: ['size:m'] },
      { sku: 'AMR-MCS-L', originalPrice: '420.00', currentPrice: '329.00', stock: 8, attrs: ['size:l'] },
      { sku: 'AMR-MCS-XL', originalPrice: '420.00', currentPrice: '359.00', stock: 0, attrs: ['size:xl'] },
    ],
  },
  // (c) COLOR-only.
  {
    slug: 'women-silk-scarf',
    name: 'شال نسائي ناعم',
    category: 'women-abayas',
    short: 'شال بخامات فخمة تناسب كل الإطلالات',
    status: 'active',
    media: ['abaya', 'shirt'],
    variants: [
      { sku: 'AMR-WSS-BLK', originalPrice: '260.00', currentPrice: '219.00', stock: 12, attrs: ['color:black'], ownImage: 'abaya' },
      { sku: 'AMR-WSS-WHT', originalPrice: '260.00', currentPrice: '219.00', stock: 5, attrs: ['color:white'], ownImage: 'shirt' },
      { sku: 'AMR-WSS-BLS', originalPrice: '275.00', currentPrice: '239.00', stock: 9, attrs: ['color:blush'], ownImage: 'abaya' },
    ],
  },
  // (d) SIZE + COLOR — explicit subset ONLY (no forced Cartesian matrix):
  //     possible combos = 3 sizes × 2 colors = 6, only 4 actually sellable.
  {
    slug: 'kids-tshirt-basics',
    name: 'تيشيرت أطفال قطن بيسك',
    category: 'kids-boys',
    short: 'تيشيرت قطني مريح بحركات مريحة للعب',
    status: 'active',
    media: ['kids-tshirt'],
    variants: [
      { sku: 'AMR-KTS-4-BLS', originalPrice: '150.00', currentPrice: '119.00', stock: 20, attrs: ['size:s', 'color:blush'], ownImage: 'kids-tshirt' },
      { sku: 'AMR-KTS-6-BLS', originalPrice: '150.00', currentPrice: '119.00', stock: 16, attrs: ['size:m', 'color:blush'] },
      { sku: 'AMR-KTS-6-SKY', originalPrice: '150.00', currentPrice: '125.00', stock: 11, attrs: ['size:m', 'color:sky'], ownImage: 'shirt' },
      { sku: 'AMR-KTS-8-SKY', originalPrice: '160.00', currentPrice: '129.00', stock: 7, attrs: ['size:l', 'color:sky'] },
    ],
  },
  // (e) VOLUME-only (cosmetics).
  {
    slug: 'daily-moisturizer',
    name: 'كريم مرطب يومي للبشرة',
    category: 'cosmetics-skincare',
    short: 'ترطيب عميق يدوم 24 ساعة',
    status: 'active',
    media: ['cream'],
    variants: [
      { sku: 'AMR-CRM-50', originalPrice: '320.00', currentPrice: '289.00', stock: 15, attrs: ['volume:50ml'] },
      { sku: 'AMR-CRM-100', originalPrice: '480.00', currentPrice: '439.00', stock: 6, attrs: ['volume:100ml'] },
    ],
  },
  // (f) VOLUME + SHADE (cosmetics, multi-attribute beyond size+color).
  {
    slug: 'liquid-foundation',
    name: 'كريم أساس سائل طبيعي',
    category: 'cosmetics-makeup',
    short: 'تغطية طبيعية تدوم طويلاً',
    status: 'active',
    media: ['foundation'],
    variants: [
      { sku: 'AMR-FND-30-L', originalPrice: '390.00', currentPrice: '349.00', stock: 12, attrs: ['volume:50ml', 'shade:light'] },
      { sku: 'AMR-FND-30-M', originalPrice: '390.00', currentPrice: '349.00', stock: 4, attrs: ['volume:50ml', 'shade:medium'] },
      { sku: 'AMR-FND-100-M', originalPrice: '520.00', currentPrice: '469.00', stock: 2, attrs: ['volume:100ml', 'shade:medium'] },
    ],
  },
  // (g) DRAFT product (admin lifecycle completeness).
  {
    slug: 'women-summer-dress',
    name: 'فستان صيفي نسائي',
    category: 'women-dresses',
    short: 'فستان صيفي خفيف بألوان الموسم',
    status: 'draft',
    media: ['abaya'],
    variants: [
      { sku: 'AMR-WSD-M', originalPrice: '650.00', currentPrice: '589.00', stock: 3, attrs: ['size:m'] },
    ],
  },
  // Additional realistic Arabic demo catalog entries — the acceptance seed is
  // exactly 20 products total, while still retaining the verification-shape
  // products above. Each active demo product owns one sellable variant.
  { slug: 'women-linen-abaya', name: 'عباية كتان عملية', category: 'women-abayas', short: 'عباية يومية بخامة خفيفة وقصة مريحة', status: 'active', media: ['abaya'], variants: [{ sku: 'AMR-WLA-001', originalPrice: '780.00', currentPrice: '699.00', stock: 9, attrs: [] }] },
  { slug: 'women-basic-dress', name: 'فستان نسائي أساسي', category: 'women-dresses', short: 'فستان بسيط مناسب للخروج اليومي', status: 'active', media: ['abaya'], variants: [{ sku: 'AMR-WBD-001', originalPrice: '590.00', currentPrice: '499.00', stock: 11, attrs: ['size:m'] }] },
  { slug: 'women-soft-hijab', name: 'طرحة شيفون ناعمة', category: 'women-abayas', short: 'طرحة شيفون سهلة التنسيق وثابتة في الارتداء', status: 'active', media: ['shirt'], variants: [{ sku: 'AMR-WSH-001', originalPrice: '180.00', currentPrice: '149.00', stock: 18, attrs: ['color:black'] }] },
  { slug: 'men-polo-shirt', name: 'تيشيرت بولو رجالي', category: 'men-shirts', short: 'بولو قطني عملي للاستخدام اليومي', status: 'active', media: ['shirt'], variants: [{ sku: 'AMR-MPS-001', originalPrice: '360.00', currentPrice: '299.00', stock: 16, attrs: ['size:l'] }] },
  { slug: 'men-casual-tshirt', name: 'تيشيرت رجالي كاجوال', category: 'men-shirts', short: 'تيشيرت قطني خفيف بقصة عصرية', status: 'active', media: ['shirt'], variants: [{ sku: 'AMR-MCT-001', originalPrice: '280.00', currentPrice: '229.00', stock: 21, attrs: ['size:m'] }] },
  { slug: 'kids-girl-dress', name: 'فستان بناتي للعيد', category: 'kids-girls', short: 'فستان بناتي لطيف للمناسبات والخروجات', status: 'active', media: ['kids-tshirt'], variants: [{ sku: 'AMR-KGD-001', originalPrice: '430.00', currentPrice: '379.00', stock: 7, attrs: ['size:m'] }] },
  { slug: 'kids-hoodie', name: 'هودي أطفال دافئ', category: 'kids-boys', short: 'هودي مريح للمدرسة والخروج في الجو البارد', status: 'active', media: ['kids-tshirt'], variants: [{ sku: 'AMR-KHD-001', originalPrice: '420.00', currentPrice: '349.00', stock: 8, attrs: ['size:l'] }] },
  { slug: 'kids-cotton-shorts', name: 'شورت أطفال قطني', category: 'kids-boys', short: 'شورت عملي وخفيف للحركة واللعب', status: 'active', media: ['kids-tshirt'], variants: [{ sku: 'AMR-KCS-001', originalPrice: '220.00', currentPrice: '179.00', stock: 14, attrs: ['color:sky'] }] },
  { slug: 'baby-bodysuit', name: 'بادي مواليد قطني', category: 'baby-clothing', short: 'بادي ناعم مناسب للبشرة الحساسة', status: 'active', media: ['baby-towel'], variants: [{ sku: 'AMR-BBD-001', originalPrice: '210.00', currentPrice: '179.00', stock: 20, attrs: ['size:s'] }] },
  { slug: 'baby-warm-blanket', name: 'بطانية مواليد ناعمة', category: 'baby-clothing', short: 'بطانية خفيفة ودافئة للاستخدام اليومي', status: 'active', media: ['baby-towel'], variants: [{ sku: 'AMR-BWB-001', originalPrice: '360.00', currentPrice: '319.00', stock: 10, attrs: [] }] },
  { slug: 'baby-cap-set', name: 'طقم كاب وشرابات للمواليد', category: 'baby-clothing', short: 'طقم عملي وناعم للأيام الأولى', status: 'active', media: ['baby-towel'], variants: [{ sku: 'AMR-BCS-001', originalPrice: '170.00', currentPrice: '139.00', stock: 13, attrs: [] }] },
  { slug: 'lipstick-soft-rose', name: 'أحمر شفاه وردي ناعم', category: 'cosmetics-makeup', short: 'درجة وردية ناعمة مناسبة للاستخدام اليومي', status: 'active', media: ['foundation'], variants: [{ sku: 'AMR-LSR-001', originalPrice: '240.00', currentPrice: '199.00', stock: 17, attrs: ['shade:light'] }] },
  { slug: 'gentle-face-cleanser', name: 'غسول وجه لطيف', category: 'cosmetics-skincare', short: 'غسول يومي لطيف لتنظيف البشرة دون جفاف', status: 'active', media: ['cream'], variants: [{ sku: 'AMR-GFC-001', originalPrice: '290.00', currentPrice: '249.00', stock: 12, attrs: ['volume:100ml'] }] },
];

if (catalog.length !== 20) {
  throw new Error(`[db-seed] Acceptance seed drifted: expected exactly 20 products, found ${catalog.length}.`);
}

for (const p of catalog) {
  const [productRow] = await db
    .insert(products)
    .values({
      slug: p.slug,
      name: p.name,
      categoryId: categoryIds.get(p.category)!,
      shortDescription: p.short,
      status: p.status,
    })
    .onConflictDoUpdate({
      target: products.slug,
      set: {
        name: p.name,
        categoryId: categoryIds.get(p.category)!,
        shortDescription: p.short,
        status: p.status,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: products.id });

  // Gallery images: first is primary (product-level).
  for (const [k, mediaSlug] of p.media.entries()) {
    const values = {
      productId: productRow.id,
      variantId: null as string | null,
      mediaAssetId: mediaIds.get(mediaSlug)!,
      isPrimary: k === 0,
      sortOrder: k,
      altText: DEMO_ALT,
    };
    await db.insert(productImages).values(values).onConflictDoNothing();
  }

  for (const v of p.variants) {
    const [variantRow] = await db
      .insert(productVariants)
      .values({
        productId: productRow.id,
        sku: v.sku,
        originalPrice: v.originalPrice,
        currentPrice: v.currentPrice,
        stockQuantity: v.stock,
      })
      .onConflictDoUpdate({
        target: productVariants.sku,
        set: {
          productId: productRow.id,
          originalPrice: v.originalPrice,
          currentPrice: v.currentPrice,
          stockQuantity: v.stock,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: productVariants.id });

    // Variant attribute assignments — only values that actually apply.
    for (const key of v.attrs) {
      const [attrSlug] = key.split(':');
      await db
        .insert(variantAttributeValues)
        .values({
          variantId: variantRow.id,
          attributeValueId: valueIds.get(key)!,
          attributeId: attributeIds.get(attrSlug)!,
        })
        .onConflictDoNothing({
          target: [
            variantAttributeValues.variantId,
            variantAttributeValues.attributeValueId,
          ],
        });
    }

    // Variant-specific image.
    if (v.ownImage) {
      await db
        .insert(productImages)
        .values({
          productId: productRow.id,
          variantId: variantRow.id,
          mediaAssetId: mediaIds.get(v.ownImage)!,
          isPrimary: true,
          sortOrder: 0,
          altText: DEMO_ALT,
        })
        .onConflictDoNothing();
    }
  }

  // Size guide for the clothing product (optional per MASTER_PLAN §6).
  if (p.slug === 'men-classic-shirt') {
    const [guide] = await db
      .insert(sizeGuides)
      .values({ productId: productRow.id, title: 'دليل المقاسات (سم)' })
      .onConflictDoNothing()
      .returning({ id: sizeGuides.id });
    if (guide) {
      await db.insert(sizeGuideRows).values([
        { sizeGuideId: guide.id, sizeLabel: 'S', measurements: { chest: '96', length: '70' }, sortOrder: 0 },
        { sizeGuideId: guide.id, sizeLabel: 'M', measurements: { chest: '102', length: '72' }, sortOrder: 1 },
        { sizeGuideId: guide.id, sizeLabel: 'L', measurements: { chest: '108', length: '74' }, sortOrder: 2 },
        { sizeGuideId: guide.id, sizeLabel: 'XL', measurements: { chest: '114', length: '76' }, sortOrder: 3 },
      ]);
    }
  }
}
console.log(`[db-seed] products + variants ✔ (${catalog.length} products)`);

/* -------------------------------------------------------------------------- */
/* 6. Sample reviews (approved + pending — NO orders, so none are verified)    */
/* -------------------------------------------------------------------------- */

const reviewSeeds = [
  { productSlug: 'men-classic-shirt', rating: 5, comment: 'قميص ممتاز والقماش مريح جدًا، التغليف كان أنيقًا.', status: 'approved' as const },
  { productSlug: 'women-silk-scarf', rating: 5, comment: 'الشال أجمل من الصور بصراحة، شكرًا أميرة استور.', status: 'approved' as const },
  { productSlug: 'daily-moisturizer', rating: 4, comment: 'ترطيبه حلو ورائحته خفيفة، هجرب تاني أكيد.', status: 'approved' as const },
  { productSlug: 'kids-tshirt-basics', rating: 4, comment: 'جودة القماش ممتازة ومقاساته مظبوطة.', status: 'pending' as const },
];

const productSlugToId = new Map<string, string>();
{
  const slugs = reviewSeeds.map((r) => r.productSlug);
  const rows = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(inArray(products.slug, slugs));
  for (const r of rows) productSlugToId.set(r.slug, r.id);
}

for (const r of reviewSeeds) {
  const productId = productSlugToId.get(r.productSlug);
  if (!productId) continue;
  // Deterministic: one review per product+comment — reuse if rerun.
  const existing = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(sql`${reviews.productId} = ${productId} AND ${reviews.comment} = ${r.comment}`)
    .limit(1);
  if (existing.length === 0) {
    await db.insert(reviews).values({
      productId,
      rating: r.rating,
      comment: r.comment,
      status: r.status,
      isVerifiedPurchase: false,
    });
  }
}
console.log('[db-seed] sample reviews ✔ (approved + pending, unverified)');

/* -------------------------------------------------------------------------- */
/* 7. Sample WhatsApp testimonials (clearly-marked demo assets)                */
/* -------------------------------------------------------------------------- */

const testimonialSeeds = [
  { media: 'testimonial-1', name: 'م. سارة', city: 'القاهرة', caption: 'تجربة شراء مريحة والتعامل راقي جدًا على واتساب', status: 'published' as const },
  { media: 'testimonial-2', name: 'أ. منى', city: 'الإسكندرية', caption: 'وصل الطلب بسرعة وكل حاجة كانت زي ما اتفقنا', status: 'draft' as const },
];

for (const [i, t] of testimonialSeeds.entries()) {
  const mediaAssetId = mediaIds.get(t.media)!;
  const existing = await db
    .select({ id: whatsappTestimonials.id })
    .from(whatsappTestimonials)
    .where(eq(whatsappTestimonials.mediaAssetId, mediaAssetId))
    .orderBy(asc(whatsappTestimonials.createdAt), asc(whatsappTestimonials.id));

  const keepId = existing[0]?.id;
  if (keepId) {
    // Repair any duplicates left by older seed versions before updating the
    // canonical demo row. Only rows tied to the deterministic demo media are
    // touched; real/admin-authored testimonials use different media ids.
    const duplicateIds = existing.slice(1).map((row) => row.id);
    if (duplicateIds.length > 0) {
      await db.delete(whatsappTestimonials).where(inArray(whatsappTestimonials.id, duplicateIds));
    }
    await db
      .update(whatsappTestimonials)
      .set({
        displayName: t.name,
        city: t.city,
        caption: t.caption,
        status: t.status,
        sortOrder: i,
        updatedAt: sql`now()`,
      })
      .where(eq(whatsappTestimonials.id, keepId));
  } else {
    await db.insert(whatsappTestimonials).values({
      mediaAssetId,
      displayName: t.name,
      city: t.city,
      caption: t.caption,
      status: t.status,
      sortOrder: i,
    });
  }
}
console.log('[db-seed] WhatsApp testimonials ✔ (1 published + 1 draft)');

/* -------------------------------------------------------------------------- */
/* 8. Homepage sections (code-limited keys, query-driven sections stay rules)  */
/* -------------------------------------------------------------------------- */

const sectionSeeds = [
  { sectionKey: 'announcement', title: 'شريط الإعلانات', sortOrder: 0 },
  { sectionKey: 'hero', title: 'البانر الرئيسي', sortOrder: 1 },
  { sectionKey: 'categories', title: 'الأقسام', sortOrder: 2 },
  { sectionKey: 'new_arrivals', title: 'وصل حديثًا', sortOrder: 3 },
  { sectionKey: 'offers', title: 'العروض', sortOrder: 4 },
  { sectionKey: 'benefits', title: 'لماذا أميرة استور', sortOrder: 5 },
  { sectionKey: 'brand_story', title: 'قصتنا', sortOrder: 6 },
  { sectionKey: 'reviews', title: 'تقييمات العملاء', sortOrder: 7 },
  { sectionKey: 'testimonials', title: 'آراء عملائنا على واتساب', sortOrder: 8 },
  { sectionKey: 'whatsapp_cta', title: 'تواصلي معنا', sortOrder: 9 },
] as const;

for (const s of sectionSeeds) {
  await db
    .insert(homepageSections)
    .values({
      sectionKey: s.sectionKey,
      title: s.title,
      sortOrder: s.sortOrder,
      isEnabled: true,
    })
    .onConflictDoUpdate({
      target: homepageSections.sectionKey,
      set: { title: s.title, sortOrder: s.sortOrder },
    });
}
console.log('[db-seed] homepage sections ✔');

/* -------------------------------------------------------------------------- */
/* Summary                                                                     */
/* -------------------------------------------------------------------------- */

const counts = await db.execute<{
  products: string; variants: string; vav: string; images: string;
}>(sql`
  SELECT
    (SELECT count(*) FROM products)::text AS products,
    (SELECT count(*) FROM product_variants)::text AS variants,
    (SELECT count(*) FROM variant_attribute_values)::text AS vav,
    (SELECT count(*) FROM product_images)::text AS images
`);
console.log('[db-seed] summary:', counts.rows[0]);
console.log('[db-seed] DONE — deterministic, re-run safe.');

await getPool().end();
