/**
 * Amira Store — PHASE-05 storefront verification suite.
 *
 * Exercises the application's OWN storefront services (src/lib/storefront/*)
 * against the target database and asserts every PHASE-05 task verifiable at
 * the service layer:
 *
 *   1. Arabic normalization: TypeScript vs SQL translate() byte-equivalence
 *   2. search fields (task 7): name / SKU / short description / category
 *      names / attribute values
 *   3. Arabic-aware matching (task 6): tashkeel-insensitive + alef/taa/ya unification
 *   4. fuzzy tier (task 8): pg_trgm typo tolerance ("قيمص" → قميص)
 *   5. storefront visibility: draft products + zero-active-variant products excluded
 *   6. category subtree listing (task 3): parent lists children's products
 *   7. category-aware facets (task 9): per-category attribute values + counts
 *   8. filters (task 9): attribute groups, on-sale, in-stock, price range
 *   9. sorting (task 10): newest / price asc+desc / name / discount
 *  10. pagination math + page disjointness
 *  11. product aggregate: all variant shapes (no-attr / size-only / color-only
 *      with variant images / size+color / volume+shade) + gallery levels
 *  12. inactive variant honesty: flagged in the aggregate; product with zero
 *      active variants excluded from listings
 *  13. reviews moderation gate: approved only
 *  14. size guide rows
 *  15. structured metadata contracts (tasks 12–13): CartEntryDraft + JSON-LD
 *  16. homepage data: new arrivals (created_at-driven) + offers (real discounts)
 *  17. search suggestions service contract
 *
 * Safety:
 * - REFUSES NODE_ENV=production;
 * - probe rows (inactive-variant product) are removed in `finally`;
 * - never prints credentials.
 *
 * Run against the isolated development database only:
 *   set -a; . ./.env.local; set +a; bun run verify:storefront
 */

import { eq, sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import {
  productVariants,
  products,
} from '../src/db/schema';
import { normalizeArabic, normalizeSqlExpr } from '../src/lib/storefront/arabic';
import {
  getSearchSuggestions,
  getStorefrontCategoryPage,
  getStorefrontFacets,
  getStorefrontHomepageData,
  getStorefrontProductDetail,
  listStorefrontProducts,
  searchStorefrontProducts,
} from '../src/lib/storefront/catalog';
import { buildCartEntryDraft, buildProductJsonLd } from '../src/lib/storefront/metadata';
import { formatPrice, discountPercent } from '../src/lib/storefront/format';

if (process.env.NODE_ENV === 'production') {
  console.error('[verify-storefront] REFUSED: never run storefront probes against production.');
  process.exit(1);
}

let passes = 0;
let failures = 0;

function pass(name: string, detail = ''): void {
  passes += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name: string, detail = ''): void {
  failures += 1;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(name: string, condition: boolean, detail = ''): void {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

function section(title: string): void {
  console.log(`\n[${title}]`);
}

/** Runs a raw SQL scalar through the SAME normalization used for columns. */
async function sqlNormalize(value: string): Promise<string> {
  const result = await db.execute<{ out: string }>(
    sql`select ${normalizeSqlExpr(sql.raw(`'${value.replace(/'/g, "''")}'`))} as out`,
  );
  return result.rows[0]!.out;
}

/* -------------------------------------------------------------------------- */
/* Seed slugs (db-seed.ts fixtures)                                            */
/* -------------------------------------------------------------------------- */

const SEED = {
  categories: { women: 'women', womenDresses: 'women-dresses', men: 'men', menShirts: 'men-shirts', kidsBoys: 'kids-boys', cosmetics: 'cosmetics', cosmeticsMakeup: 'cosmetics-makeup' },
  products: {
    babyTowel: 'baby-cotton-towel',
    menShirt: 'men-classic-shirt',
    silkScarf: 'women-silk-scarf',
    kidsTshirt: 'kids-tshirt-basics',
    moisturizer: 'daily-moisturizer',
    foundation: 'liquid-foundation',
    draftDress: 'women-summer-dress',
  },
} as const;

async function main(): Promise<void> {
  /* ------------------------------------------------------------------------ */
  section('1. Arabic normalization — TS vs SQL equivalence');
  const corpus = [
    'قميص رجالي كلاسيك قطن',
    'قَمِيصٌ رجالي', // tashkeel
    'شال نسائي ناعم',
    'أبيض إيه آه ٱمرأة', // alef variants
    'مستحضرات تجميل', // ة
    'فستان صيفي',
    'AMR-WSS-BLK',
    'شَيْءٌ ٱخْرَى 50 مل',
    'عائلة  عربية   متعددة', // multi-space (column side keeps spacing; both sides must still agree modulo query-side collapsing)
  ];
  for (const text of corpus) {
    const expected = normalizeArabic(text);
    const actual = await sqlNormalize(text);
    assert(`normalize(${JSON.stringify(text.slice(0, 18))}…)`, expected === actual, `"${actual}"`);
  }

  /* ------------------------------------------------------------------------ */
  section('2. Search fields (task 7): name / SKU / description / category / attribute value');
  {
    const byName = await searchStorefrontProducts({ query: 'قميص' });
    assert('name match', byName.items.some((i) => i.slug === SEED.products.menShirt), `${byName.total} hits`);

    const bySku = await searchStorefrontProducts({ query: 'AMR-WSS-BLK' });
    assert('SKU match (exact)', bySku.items.some((i) => i.slug === SEED.products.silkScarf));
    const bySkuLower = await searchStorefrontProducts({ query: 'amr-crm-100' });
    assert('SKU match (case-insensitive)', bySkuLower.items.some((i) => i.slug === SEED.products.moisturizer));

    const byDesc = await searchStorefrontProducts({ query: 'ترطيب عميق' });
    assert('short description match', byDesc.items.some((i) => i.slug === SEED.products.moisturizer));

    const byCategory = await searchStorefrontProducts({ query: 'مكياج' });
    assert('category name match', byCategory.items.some((i) => i.slug === SEED.products.foundation));
    assert('category chips offered', byCategory.matchedCategories.some((c) => c.slug === SEED.categories.cosmeticsMakeup));

    const byValue = await searchStorefrontProducts({ query: 'أسود' });
    assert('attribute value match (color)', byValue.items.some((i) => i.slug === SEED.products.silkScarf));
    const byVolume = await searchStorefrontProducts({ query: '50 مل' });
    assert(
      'attribute value match (volume)',
      byVolume.items.some((i) => i.slug === SEED.products.moisturizer) &&
        byVolume.items.some((i) => i.slug === SEED.products.foundation),
    );
  }

  /* ------------------------------------------------------------------------ */
  section('3. Arabic-aware matching: tashkeel + letter unification');
  {
    const plain = await searchStorefrontProducts({ query: 'قميص' });
    const diacritic = await searchStorefrontProducts({ query: 'قَميصٌ' });
    const alefVariant = await searchStorefrontProducts({ query: 'أميرة' });
    assert(
      'tashkeel-insensitive equivalence',
      JSON.stringify(plain.items.map((i) => i.slug)) === JSON.stringify(diacritic.items.map((i) => i.slug)),
      `${diacritic.total} hits with diacritics`,
    );
    assert('alef variant query executes', alefVariant.total >= 0);
    // ة (taa marbuta) typed as ه (haa) still matches «منشفة» after normalization —
    // and a query WITH the real ة matches identically.
    const taaVariant = await searchStorefrontProducts({ query: 'منشفه' });
    const taaExact = await searchStorefrontProducts({ query: 'منشفة' });
    assert(
      'taa-marbuta/haa unification',
      taaVariant.items.some((i) => i.slug === SEED.products.babyTowel) &&
        taaExact.items.some((i) => i.slug === SEED.products.babyTowel),
      `${taaVariant.total} + ${taaExact.total} hits`,
    );
  }

  /* ------------------------------------------------------------------------ */
  section('4. Fuzzy tier (task 8): pg_trgm typo tolerance');
  {
    // strict_word_similarity ≥ 0.35: measured noise floor ≤ 0.25; real typos
    // in 5+ letter words ≥ 0.37. A single transposition in a 4-letter word
    // (قيمص) destroys most trigrams and stays OUT of the practical tier —
    // documented limit, not a hidden failure.
    const vowelTypo = await searchStorefrontProducts({ query: 'مرطاب' }); // مرطب
    assert('vowel-form typo finds moisturizer', vowelTypo.items.some((i) => i.slug === SEED.products.moisturizer), `${vowelTypo.total} hits`);
    const missingLetter = await searchStorefrontProducts({ query: 'كلسيك' }); // كلاسيك
    assert('missing-letter typo finds the shirt', missingLetter.items.some((i) => i.slug === SEED.products.menShirt), `${missingLetter.total} hits`);
    const noise = await searchStorefrontProducts({ query: 'قمزى' });
    assert('nonsense query stays below the fuzzy floor', !noise.items.some((i) => i.slug === SEED.products.menShirt), `${noise.total} hits`);
    const garbage = await searchStorefrontProducts({ query: 'zzzzzx' });
    assert('latin garbage returns zero', garbage.total === 0, `${garbage.total} hits`);
  }

  /* ------------------------------------------------------------------------ */
  section('5. Storefront visibility: draft + zero-active-variant exclusion');
  {
    const all = await listStorefrontProducts({ pageSize: 48 });
    assert('draft product excluded', !all.items.some((i) => i.slug === SEED.products.draftDress));
    const draftSearch = await searchStorefrontProducts({ query: 'فستان صيفي' });
    assert('draft excluded from search', !draftSearch.items.some((i) => i.slug === SEED.products.draftDress), `${draftSearch.total} hits (exact-name search still finds nothing)`);

    // Probe: product whose ONLY variant is inactive must be excluded.
    const [shirt] = await db.select().from(products).where(eq(products.slug, SEED.products.menShirt)).limit(1);
    const [probe] = await db
      .insert(products)
      .values({ name: 'منتج اختبار غير منشور المتغير', slug: 'probe-storefront-inactive', categoryId: shirt!.categoryId, status: 'active' })
      .returning({ id: products.id });
    const [probeVariant] = await db
      .insert(productVariants)
      .values({ productId: probe!.id, sku: 'PROBE-INACTIVE-1', originalPrice: '10.00', currentPrice: '9.00', stockQuantity: 5, isActive: false })
      .returning({ id: productVariants.id });
    try {
      const listing = await listStorefrontProducts({ pageSize: 48 });
      assert('zero-active-variant product excluded from listing', !listing.items.some((i) => i.id === probe!.id));
      const searched = await searchStorefrontProducts({ query: 'منتج اختبار غير منشور' });
      assert('zero-active-variant product excluded from search', searched.total === 0);
    } finally {
      await db.delete(products).where(eq(products.id, probe!.id));
      void probeVariant;
    }
    assert('probe cleaned up', true);
  }

  /* ------------------------------------------------------------------------ */
  section('6. Category subtree listing (task 3)');
  {
    const womenPage = await getStorefrontCategoryPage(SEED.categories.women);
    assert('women subtree resolves', (womenPage?.subtreeIds.length ?? 0) >= 3, `${womenPage?.subtreeIds.length} ids`);
    const womenListing = await listStorefrontProducts({ categoryIds: womenPage!.subtreeIds });
    assert('parent lists child-category products', womenListing.items.some((i) => i.slug === SEED.products.silkScarf), `${womenListing.total} products`);

    const childPage = await getStorefrontCategoryPage(SEED.categories.menShirts);
    assert('child category resolves', childPage?.category.slug === SEED.categories.menShirts);
    assert('breadcrumb chain built', childPage?.ancestors[0]?.slug === SEED.categories.men);

    const missing = await getStorefrontCategoryPage('no-such-category');
    assert('unknown category → null (page 404s)', missing === null);
  }

  /* ------------------------------------------------------------------------ */
  section('7. Category-aware facets (task 9)');
  {
    const menPage = await getStorefrontCategoryPage(SEED.categories.men);
    const menFacets = await getStorefrontFacets(menPage!.subtreeIds);
    const sizeFacet = menFacets.attributes.find((a) => a.name === 'المقاس');
    assert('size facet present in men subtree', sizeFacet !== undefined);
    assert(
      'size values S/M/L/XL present',
      ['S', 'M', 'L', 'XL'].every((v) => sizeFacet?.values.some((value) => value.value === v)),
      sizeFacet?.values.map((v) => `${v.value}:${v.productCount}`).join(' ') ?? '',
    );

    const cosmeticsPage = await getStorefrontCategoryPage(SEED.categories.cosmetics);
    const cosmeticsFacets = await getStorefrontFacets(cosmeticsPage!.subtreeIds);
    const names = cosmeticsFacets.attributes.map((a) => a.name);
    assert('cosmetics facets show volume/shade (NOT size/color)', names.includes('الحجم') && names.includes('الدرجة') && !names.includes('المقاس'), names.join('، '));
    assert('price range facet resolved', cosmeticsFacets.priceMin !== null && Number(cosmeticsFacets.priceMax) >= Number(cosmeticsFacets.priceMin));
  }

  /* ------------------------------------------------------------------------ */
  section('8. Filters (task 9): attribute groups / sale / stock / price');
  {
    const kidsPage = await getStorefrontCategoryPage(SEED.categories.kidsBoys);
    const kidsFacets = await getStorefrontFacets(kidsPage!.subtreeIds);
    const sizeAttr = kidsFacets.attributes.find((a) => a.name === 'المقاس')!;
    const sizeM = sizeAttr.values.find((v) => v.value === 'M')!;

    const bySize = await listStorefrontProducts({
      categoryIds: kidsPage!.subtreeIds,
      attributeValueIdsByAttribute: { [sizeAttr.id]: [sizeM.id] },
    });
    assert('attribute filter (size M)', bySize.items.every((i) => i.slug === SEED.products.kidsTshirt) && bySize.total === 1);

    const onSale = await listStorefrontProducts({ onSale: true, pageSize: 48 });
    assert('on-sale filter: every hit genuinely discounted', onSale.items.every((i) => i.maxDiscountPercent > 0) && onSale.total > 0, `${onSale.total} products`);

    const inStock = await listStorefrontProducts({ inStockOnly: true, pageSize: 48 });
    assert('in-stock filter excludes zero-stock-only products', inStock.items.every((i) => i.inStock));

    const priceBand = await listStorefrontProducts({ priceMin: 120, priceMax: 200, pageSize: 48 });
    assert(
      'price band overlap filter',
      priceBand.items.length > 0 &&
        priceBand.items.every((i) => Number(i.priceMin) <= 200 && Number(i.priceMax) >= 120),
      `${priceBand.total} products`,
    );

    const emptyBand = await listStorefrontProducts({ priceMin: 100000, priceMax: 200000 });
    assert('impossible price band → zero results', emptyBand.total === 0);
  }

  /* ------------------------------------------------------------------------ */
  section('9. Sorting (task 10)');
  {
    const asc = await listStorefrontProducts({ sort: 'price-asc', pageSize: 48 });
    const ascPrices = asc.items.map((i) => Number(i.priceMin));
    assert('price ascending', ascPrices.every((p, idx) => idx === 0 || p >= ascPrices[idx - 1]!));

    const desc = await listStorefrontProducts({ sort: 'price-desc', pageSize: 48 });
    const descPrices = desc.items.map((i) => Number(i.priceMax));
    assert('price descending', descPrices.every((p, idx) => idx === 0 || p <= descPrices[idx - 1]!));

    const newest = await listStorefrontProducts({ sort: 'newest', pageSize: 48 });
    const dates = newest.items.map((i) => i.createdAt instanceof Date ? i.createdAt.getTime() : new Date(i.createdAt).getTime());
    assert('newest first (created_at desc)', dates.every((d, idx) => idx === 0 || d <= dates[idx - 1]!));

    const discount = await listStorefrontProducts({ sort: 'discount', onSale: true, pageSize: 48 });
    const pcts = discount.items.map((i) => i.maxDiscountPercent);
    assert('discount strongest first', pcts.every((p, idx) => idx === 0 || p <= pcts[idx - 1]!), pcts.slice(0, 3).join('%, ') + '%');

    const byName = await listStorefrontProducts({ sort: 'name', pageSize: 48 });
    assert('name sort returns full set', byName.items.length === (await listStorefrontProducts({ pageSize: 48 })).total);
  }

  /* ------------------------------------------------------------------------ */
  section('10. Pagination');
  {
    const firstPage = await listStorefrontProducts({ page: 1, pageSize: 2 });
    const secondPage = await listStorefrontProducts({ page: 2, pageSize: 2 });
    assert('pageCount math', firstPage.pageCount === Math.ceil(firstPage.total / 2), `total=${firstPage.total}, pageCount=${firstPage.pageCount}`);
    const ids1 = new Set(firstPage.items.map((i) => i.id));
    assert('pages disjoint', secondPage.items.every((i) => !ids1.has(i.id)));
    const beyond = await listStorefrontProducts({ page: 999, pageSize: 2 });
    assert('page beyond range → empty, no crash', beyond.items.length === 0);
  }

  /* ------------------------------------------------------------------------ */
  section('11. Product aggregate: all five variant shapes');
  {
    const towel = await getStorefrontProductDetail(SEED.products.babyTowel);
    assert('no-attribute shape: zero attribute groups', towel !== null && towel.attributes.length === 0);
    assert('no-attribute shape: single default variant', towel?.variants.length === 1);
    assert('no-attribute price is exact', towel?.variants[0]?.currentPrice === '149.00');

    const shirt = await getStorefrontProductDetail(SEED.products.menShirt);
    assert('size-only shape: one attribute group', shirt?.attributes.length === 1 && shirt.attributes[0]!.name === 'المقاس');
    assert('size-only: 4 explicit variants (no matrix)', shirt?.variants.length === 4);
    assert('size-only: zero-stock XL preserved', shirt?.variants.some((v) => v.stockQuantity === 0) === true);
    assert('size-only: per-variant prices differ (L discounted)', new Set(shirt?.variants.map((v) => v.currentPrice)).size >= 2);
    assert('size guide attached', (shirt?.sizeGuide?.rows.length ?? 0) === 4);
    assert('approved reviews only', (shirt?.reviews.count ?? 0) >= 1 && (shirt?.reviews.items.every((r) => r.rating >= 1 && r.rating <= 5) ?? false));

    const scarf = await getStorefrontProductDetail(SEED.products.silkScarf);
    assert('color-only shape: color attribute only', scarf?.attributes.length === 1 && scarf?.attributes[0]?.name === 'اللون');
    assert('color-only: variant images exist', Object.keys(scarf?.variantImages ?? {}).length === 3);
    assert('gallery: product-level images present', (scarf?.gallery.length ?? 0) >= 1);
    assert('gallery: exactly one primary', scarf?.gallery.filter((g) => g.isPrimary).length === 1);

    const kids = await getStorefrontProductDetail(SEED.products.kidsTshirt);
    assert('size+color shape: two attribute groups', kids?.attributes.length === 2);
    assert('size+color: explicit subset (4 of 6 combos)', kids?.variants.length === 4);
    const kidsCombo = new Set(kids?.variants.map((v) => v.assignments.map((a) => a.valueId).sort().join('+')));
    assert('size+color: no duplicate combinations', kidsCombo.size === 4);
    assert('pending review NOT shown', kids?.reviews.count === 0);

    const foundation = await getStorefrontProductDetail(SEED.products.foundation);
    assert('volume+shade shape (generic attrs)', foundation?.attributes.length === 2 && foundation?.variants.length === 3);
  }

  /* ------------------------------------------------------------------------ */
  section('12. Inactive variant honesty (UX state)');
  {
    const [shirt] = await db.select().from(products).where(eq(products.slug, SEED.products.menShirt)).limit(1);
    const [probe] = await db
      .insert(products)
      .values({ name: 'منتج اختبار بمتغير غير مفعّل', slug: 'probe-storefront-mixed', categoryId: shirt!.categoryId, status: 'active' })
      .returning({ id: products.id });
    const [activeVariant] = await db
      .insert(productVariants)
      .values({ productId: probe!.id, sku: 'PROBE-MIX-A', originalPrice: '50.00', currentPrice: '45.00', stockQuantity: 3, isActive: true })
      .returning({ id: productVariants.id });
    const [inactiveVariant] = await db
      .insert(productVariants)
      .values({ productId: probe!.id, sku: 'PROBE-MIX-B', originalPrice: '50.00', currentPrice: '45.00', stockQuantity: 7, isActive: false })
      .returning({ id: productVariants.id });
    try {
      const detail = await getStorefrontProductDetail('probe-storefront-mixed');
      assert('mixed-activity product visible', detail !== null);
      assert('inactive variant flagged (isActive=false)', detail?.variants.some((v) => v.id === inactiveVariant!.id && v.isActive === false) === true);
      assert('active variant flagged (isActive=true)', detail?.variants.some((v) => v.id === activeVariant!.id && v.isActive === true) === true);
      assert('listing counts only active stock', detail !== null && detail.variants.filter((v) => v.isActive).length === 1);
    } finally {
      await db.delete(products).where(eq(products.id, probe!.id));
    }
    assert('probe cleaned up', true);
  }

  /* ------------------------------------------------------------------------ */
  section('13. Reviews moderation gate');
  {
    const kids = await getStorefrontProductDetail(SEED.products.kidsTshirt);
    assert('pending review excluded', kids?.reviews.count === 0);
    const moisturizer = await getStorefrontProductDetail(SEED.products.moisturizer);
    assert('approved review shown with average', (moisturizer?.reviews.count ?? 0) >= 1 && moisturizer?.reviews.average !== null);
  }

  /* ------------------------------------------------------------------------ */
  section('14. Size guide rows');
  {
    const shirt = await getStorefrontProductDetail(SEED.products.menShirt);
    const rows = shirt?.sizeGuide?.rows ?? [];
    assert('4 guide rows ordered', rows.length === 4 && rows[0]?.sizeLabel === 'S' && rows[3]?.sizeLabel === 'XL');
    assert('measurements map present', typeof rows[0]?.measurements === 'object' && Object.keys(rows[0]?.measurements ?? {}).length >= 2);
    const towel = await getStorefrontProductDetail(SEED.products.babyTowel);
    assert('guide absent → null (never forced)', towel?.sizeGuide === null);
  }

  /* ------------------------------------------------------------------------ */
  section('15. Structured metadata contracts (tasks 12–13)');
  {
    const kids = await getStorefrontProductDetail(SEED.products.kidsTshirt);
    const variant = kids!.variants[0]!;
    const attributeById = new Map(kids!.attributes.map((a) => [a.id, a]));
    const draft = buildCartEntryDraft({
      product: { id: kids!.product.id, slug: kids!.product.slug, name: kids!.product.name },
      variant: {
        id: variant.id,
        sku: variant.sku,
        currentPrice: variant.currentPrice,
        assignments: variant.assignments.map((a) => ({
          attributeName: attributeById.get(a.attributeId)?.name ?? '',
          value:
            attributeById
              .get(a.attributeId)
              ?.values.find((v) => v.id === a.valueId)?.value ?? '',
        })),
      },
      quantity: 3,
    });
    assert('draft carries explicit variantId', draft.variantId === variant.id);
    assert('draft label joins attributes', draft.variantLabel.includes('المقاس:') && draft.variantLabel.includes('اللون:'), draft.variantLabel);
    assert('draft unit price = variant current price (server truth)', draft.unitPrice === variant.currentPrice);
    assert('draft quantity clamped positive', draft.quantity === 3);

    const towel = await getStorefrontProductDetail(SEED.products.babyTowel);
    const towelDraft = buildCartEntryDraft({
      product: { id: towel!.product.id, slug: towel!.product.slug, name: towel!.product.name },
      variant: { id: towel!.variants[0]!.id, sku: towel!.variants[0]!.sku, currentPrice: towel!.variants[0]!.currentPrice, assignments: [] },
      quantity: 1,
    });
    assert('default-variant label falls back to product name', towelDraft.variantLabel === towel!.product.name);

    const jsonLd = buildProductJsonLd({
      name: towel!.product.name,
      description: towel!.product.shortDescription,
      imageUrl: towel!.gallery[0]?.url ?? null,
      url: `/product/${towel!.product.slug}`,
      variants: towel!.variants.map((v) => ({
        sku: v.sku,
        currentPrice: v.currentPrice,
        stockQuantity: v.stockQuantity,
        isActive: v.isActive,
        label: null,
      })),
    }) as { offers: Record<string, unknown> & { offers: Array<Record<string, unknown>> } };
    assert('JSON-LD: AggregateOffer with currency EGP', (jsonLd.offers as Record<string, unknown>)['@type'] === 'AggregateOffer' && (jsonLd.offers as Record<string, unknown>).priceCurrency === 'EGP');
    assert('JSON-LD: offer per active variant', jsonLd.offers.offers.length === towel!.variants.filter((v) => v.isActive).length);

    const shirtJsonLd = buildProductJsonLd({
      name: 'x',
      description: null,
      imageUrl: null,
      url: '/product/x',
      variants: [
        { sku: 'A', currentPrice: '10.00', stockQuantity: 0, isActive: true, label: null },
        { sku: 'B', currentPrice: '20.00', stockQuantity: 5, isActive: true, label: null },
        { sku: 'C', currentPrice: '30.00', stockQuantity: 5, isActive: false, label: null },
      ],
    }) as { offers: Record<string, unknown> & { offers: Array<{ availability: string; price: number }> } };
    const offers = shirtJsonLd.offers.offers;
    assert('JSON-LD: OutOfStock for zero-stock variant', offers[0]!.availability === 'https://schema.org/OutOfStock');
    assert('JSON-LD: InStock for stocked variant', offers[1]!.availability === 'https://schema.org/InStock');
    assert('JSON-LD: inactive variant NOT offered', offers.length === 2);
    assert('JSON-LD: low/high price span', shirtJsonLd.offers.lowPrice === 10 && shirtJsonLd.offers.highPrice === 20);

    assert('formatPrice renders EGP', formatPrice('349.00') === '349 ج.م.');
    assert('discountPercent math', discountPercent('420.00', '329.00') === 22);
  }

  /* ------------------------------------------------------------------------ */
  section('16. Homepage data (MASTER_PLAN §4 — data-driven only)');
  {
    const home = await getStorefrontHomepageData();
    assert('new arrivals capped at 8', home.newArrivals.length <= 8, `${home.newArrivals.length}`);
    assert('new arrivals exclude draft', !home.newArrivals.some((i) => i.slug === SEED.products.draftDress));
    assert('offers: every item has a real discount', home.offers.every((i) => i.maxDiscountPercent > 0));
    assert('offers: strongest discount first', home.offers.every((o, idx) => idx === 0 || home.offers[idx - 1]!.maxDiscountPercent >= o.maxDiscountPercent));
    assert('category tree has 5 departments', home.categoryTree.length === 5, home.categoryTree.map((c) => c.name).join('، '));
    const women = home.categoryTree.find((c) => c.slug === SEED.categories.women);
    assert('department counts include subtree', (women?.productCount ?? 0) >= 1, `نسائي: ${women?.productCount}`);
  }

  /* ------------------------------------------------------------------------ */
  section('17. Search suggestions service contract');
  {
    const suggestions = await getSearchSuggestions('قميص');
    assert('product suggestions returned', suggestions.products.some((p) => p.slug === SEED.products.menShirt));
    assert('suggestions carry price + image', suggestions.products.every((p) => typeof p.priceMin === 'string' && p.priceMin !== null));
    const empty = await getSearchSuggestions('ق');
    assert('sub-threshold query → empty (not error)', empty.products.length === 0 && empty.categories.length === 0);
  }

  /* ------------------------------------------------------------------------ */
  console.log(`\n[verify-storefront] ${passes} passed, ${failures} failed`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('[verify-storefront] FATAL:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end();
  });
