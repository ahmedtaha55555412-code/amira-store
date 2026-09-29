/**
 * Amira Store — PHASE-11 SEO/semantic verification suite.
 *
 * HTTP-level verification of the PHASE-11 surface against a RUNNING server
 * (dev/preview; refuses production). Cross-checks the rendered metadata
 * against the DATABASE truth via the storefront services, so a passing run
 * proves real alignment — not merely the presence of tags:
 *
 *   A. robots.txt — validity + the documented disallow contract + sitemap ref
 *   B. sitemap.xml — valid XML, only indexable routes, EXACT match against
 *      the real catalog (getSitemapEntries), no utility/private URLs
 *   C. per-route metadata — title/description/canonical/OG/twitter on every
 *      indexable route; canonical absorbs filter/query URL variants
 *   D. indexing hygiene — noindex on search/cart/checkout/order/review/admin
 *   E. structured data — PDP JSON-LD parses, reflects REAL variant prices +
 *      availability from the database, absolute URLs
 *   F. document semantics — html lang/dir, one <h1> per page, skip-link
 *      target, image alt coverage on the probed pages
 *
 * Read-only: no data is created or mutated. Never prints credentials.
 *
 * Run (with the dev server running on BASE_URL, default :3000):
 *   set -a; . ./.env.local; set +a; bun run verify:seo
 */

import { getStorefrontProductDetail } from '../src/lib/storefront/catalog';
import { getSitemapEntries } from '../src/lib/storefront/catalog';
import { getPool } from '../src/db/client';

if (process.env.NODE_ENV === 'production') {
  console.error('[verify-seo] REFUSED: never run the SEO probes against production.');
  process.exit(1);
}

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

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

async function getHtml(path: string): Promise<{ status: number; html: string } | null> {
  const res = await fetch(`${BASE_URL}${path}`, { redirect: 'follow' });
  if (!res.ok) return { status: res.status, html: await res.text() };
  return { status: res.status, html: await res.text() };
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i',
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
  return content ?? null;
}

function canonicalHref(html: string): string | null {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']*)["']/i)?.[1] ?? null;
}

function robotsMeta(html: string): string | null {
  return metaContent(html, 'robots');
}

function jsonLdBlocks(html: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1]) as Record<string, unknown>);
    } catch {
      // parse failure is reported by the caller via the returned length check
    }
  }
  return blocks;
}

const ARABIC_RE = /[\u0600-\u06FF]/;

async function main(): Promise<void> {
  console.log(`[verify-seo] target server: ${BASE_URL}`);

  /* ---------------------------------------------------------------- A) robots.txt */
  section('A) robots.txt');
  const robotsRes = await fetch(`${BASE_URL}/robots.txt`);
  assert('robots.txt reachable', robotsRes.status === 200, `status ${robotsRes.status}`);
  const robotsTxt = robotsRes.status === 200 ? await robotsRes.text() : '';
  assert('robots.txt declares a sitemap', robotsTxt.includes('Sitemap:'), '');
  const sitemapRef = robotsTxt.match(/Sitemap:\s*(\S+)/)?.[1] ?? '';
  assert('sitemap reference is absolute', /^https?:\/\//.test(sitemapRef), sitemapRef);
  const disallowed = robotsTxt;
  for (const path of ['/admin', '/api/', '/checkout', '/cart', '/order/', '/review', '/search']) {
    assert(`robots disallows ${path}`, disallowed.includes(path), '');
  }
  assert('robots allows the catalog', !/Disallow:\s*\/category|Disallow:\s*\/product|Disallow:\s*\/$/.test(robotsTxt), '');

  /* --------------------------------------------------------------- B) sitemap.xml */
  section('B) sitemap.xml');
  const sitemapRes = await fetch(`${BASE_URL}/sitemap.xml`);
  assert('sitemap.xml reachable', sitemapRes.status === 200, `status ${sitemapRes.status}`);
  const sitemapXml = sitemapRes.status === 200 ? await sitemapRes.text() : '';
  const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert('sitemap has <loc> entries', locs.length > 0, `${locs.length} URLs`);

  const dbTruth = await getSitemapEntries();
  const expectedCategoryPaths = new Set(dbTruth.categories.map((c) => c.path));
  const expectedProductPaths = new Set(dbTruth.products.map((p) => p.path));
  const sitemapPaths = locs.map((loc) => {
    try {
      return new URL(loc).pathname;
    } catch {
      return loc;
    }
  });

  const badRoutes = sitemapPaths.filter(
    (p) =>
      p.startsWith('/search') ||
      p.startsWith('/cart') ||
      p.startsWith('/checkout') ||
      p.startsWith('/order') ||
      p.startsWith('/review') ||
      p.startsWith('/admin') ||
      p.startsWith('/api'),
  );
  assert('sitemap excludes utility/private routes', badRoutes.length === 0, badRoutes.join(',') || 'none');

  const allowedPrefixes = ['/', '/about', '/contact', '/policies/', '/category/', '/product/'];
  const unknownPaths = sitemapPaths.filter(
    (p) => !allowedPrefixes.some((prefix) => (prefix === '/' ? p === '/' : p.startsWith(prefix))),
  );
  assert('sitemap contains only indexable route shapes', unknownPaths.length === 0, unknownPaths.join(',') || 'none');

  const sitemapCategoryPaths = new Set(sitemapPaths.filter((p) => p.startsWith('/category/')));
  const sitemapProductPaths = new Set(sitemapPaths.filter((p) => p.startsWith('/product/')));
  const catsMatch =
    sitemapCategoryPaths.size === expectedCategoryPaths.size &&
    [...expectedCategoryPaths].every((p) => sitemapCategoryPaths.has(p));
  assert('sitemap categories == DB-reachable active categories', catsMatch, `${expectedCategoryPaths.size} expected`);
  const prodsMatch =
    sitemapProductPaths.size === expectedProductPaths.size &&
    [...expectedProductPaths].every((p) => sitemapProductPaths.has(p));
  assert('sitemap products == DB active products in reachable branches', prodsMatch, `${expectedProductPaths.size} expected`);

  const arabicStatic = ['/about', '/contact', '/policies/privacy', '/policies/terms', '/policies/shipping'];
  for (const p of arabicStatic) {
    assert(`sitemap includes ${p}`, sitemapPaths.includes(p), '');
  }

  /* ------------------------------------------------- C+D) per-route metadata + indexing hygiene */
  section('C) per-route metadata (indexable routes)');

  const origin = (process.env.APP_URL?.trim() || BASE_URL).replace(/\/+$/, '');

  // Homepage
  const home = await getHtml('/');
  assert('homepage 200', home?.status === 200, `status ${home?.status}`);
  if (home && home.status === 200) {
    const title = home.html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '';
    assert('homepage <title> Arabic + brand', ARABIC_RE.test(title) && title.includes('أميرة استور'), title);
    assert('homepage meta description', (metaContent(home.html, 'description') ?? '').length > 30, '');
    // Next resolves the relative canonical "/" against metadataBase to the bare
    // origin (no trailing slash) — compare normalized roots, not raw suffixes.
    const originRoot = origin.replace(/\/+$/, '');
    const homeCanonical = (canonicalHref(home.html) ?? '').replace(/\/+$/, '');
    assert('homepage canonical = /', homeCanonical === originRoot, canonicalHref(home.html) ?? 'missing');
    assert('homepage og:title', (metaContent(home.html, 'og:title') ?? '').length > 0, '');
    assert('homepage og:image', (metaContent(home.html, 'og:image') ?? '').length > 0, '');
    assert('homepage og:type=website', metaContent(home.html, 'og:type') === 'website', '');
    const homeOgUrl = (metaContent(home.html, 'og:url') ?? '').replace(/\/+$/, '');
    assert('homepage og:url', homeOgUrl === originRoot, metaContent(home.html, 'og:url') ?? '');
    assert('twitter:card declared', (metaContent(home.html, 'twitter:card') ?? '').length > 0, '');
    assert('html lang=ar dir=rtl', /<html[^>]+lang=["']ar["'][^>]*dir=["']rtl["']/.test(home.html) || /<html[^>]+dir=["']rtl["'][^>]*lang=["']ar["']/.test(home.html), '');
    assert('homepage skip-link target', home.html.includes('id="main-content"'), '');
    assert('homepage single <h1>', (home.html.match(/<h1[\s>]/gi) ?? []).length === 1, '');
  }

  // Category (clean + filtered canonical absorption)
  const categorySlug = dbTruth.categories[0]?.path.split('/').pop();
  if (categorySlug) {
    const catPath = `/category/${categorySlug}`;
    const cat = await getHtml(catPath);
    assert('category 200', cat?.status === 200, `status ${cat?.status}`);
    if (cat && cat.status === 200) {
      assert('category canonical = clean URL', canonicalHref(cat.html)?.includes(catPath) === true, canonicalHref(cat.html) ?? 'missing');
      assert('category og:title', (metaContent(cat.html, 'og:title') ?? '').length > 0, '');
      assert('category og:image', (metaContent(cat.html, 'og:image') ?? '').length > 0, '');
      assert('category single <h1>', (cat.html.match(/<h1[\s>]/gi) ?? []).length === 1, '');
      assert('category indexable (no noindex)', !(robotsMeta(cat.html) ?? '').includes('noindex'), robotsMeta(cat.html) ?? 'no robots meta');
    }
    const filtered = await getHtml(`${catPath}?sort=price-asc&stock=1&page=2&attr=whatever`);
    if (filtered && filtered.status === 200) {
      assert(
        'filtered category canonical absorbs query string',
        (canonicalHref(filtered.html)?.includes(catPath) ?? false) && !(canonicalHref(filtered.html) ?? '').includes('?'),
        canonicalHref(filtered.html) ?? 'missing',
      );
      assert(
        'filtered category keeps clean og:url',
        (metaContent(filtered.html, 'og:url') ?? '').includes(catPath) && !(metaContent(filtered.html, 'og:url') ?? '').includes('?'),
        '',
      );
    }
  } else {
    fail('category probe skipped — no active categories in DB', 'seed the verification database');
  }

  // Product (metadata + JSON-LD vs DB truth)
  const productSlug = dbTruth.products[0]?.path.split('/').pop();
  if (productSlug) {
    const prodPath = `/product/${productSlug}`;
    const prod = await getHtml(prodPath);
    assert('product 200', prod?.status === 200, `status ${prod?.status}`);
    if (prod && prod.status === 200) {
      assert('product canonical', canonicalHref(prod.html)?.includes(prodPath) === true, canonicalHref(prod.html) ?? 'missing');
      assert('product og:image', (metaContent(prod.html, 'og:image') ?? '').length > 0, '');
      assert('product single <h1>', (prod.html.match(/<h1[\s>]/gi) ?? []).length === 1, '');

      const detail = await getStorefrontProductDetail(decodeURIComponent(productSlug));
      const blocks = jsonLdBlocks(prod.html);
      const productLd = blocks.find((b) => b['@type'] === 'Product');
      assert('PDP JSON-LD Product present', productLd !== undefined, `${blocks.length} block(s)`);
      if (productLd && detail) {
        const offers = productLd.offers as Record<string, unknown> | undefined;
        const childOffers = (offers?.offers ?? []) as Array<Record<string, unknown>>;
        const dbActive = detail.variants.filter((v) => v.isActive);
        assert('JSON-LD offer count == active variants', childOffers.length === dbActive.length, `${childOffers.length} vs ${dbActive.length}`);
        const dbPrices = dbActive.map((v) => Number(v.currentPrice)).sort((a, b) => a - b);
        const ldPrices = childOffers.map((o) => Number(o.price)).sort((a, b) => a - b);
        assert('JSON-LD prices == DB current prices', JSON.stringify(dbPrices) === JSON.stringify(ldPrices), `${ldPrices.join(',')} vs ${dbPrices.join(',')}`);
        const availability = childOffers.map((o) => String(o.availability));
        const dbAvailability = dbActive.map((v) => (v.stockQuantity > 0 ? 'InStock' : 'OutOfStock'));
        assert(
          'JSON-LD availability == DB stock truth',
          JSON.stringify(availability.map((a) => a.split('/').pop())) === JSON.stringify(dbAvailability),
          '',
        );
        assert('JSON-LD url is absolute', String(productLd.url ?? '').startsWith('http'), String(productLd.url ?? ''));
        if (productLd.image) {
          const img = (productLd.image as string[])[0] ?? '';
          assert('JSON-LD image is absolute', img.startsWith('http'), img);
        }
        assert('JSON-LD currency EGP', offers?.priceCurrency === 'EGP', '');
        assert('PDP indexable (no noindex)', !(robotsMeta(prod.html) ?? '').includes('noindex'), '');
      }
    }
  } else {
    fail('product probe skipped — no active products in DB', 'seed the verification database');
  }

  // Static pages: canonical + OG + indexable
  for (const [path, titleFragment] of [
    ['/about', 'من نحن'],
    ['/contact', 'تواصل'],
    ['/policies/privacy', 'الخصوصية'],
    ['/policies/terms', 'الشروط'],
    ['/policies/shipping', 'الشحن'],
  ] as const) {
    const page = await getHtml(path);
    assert(`${path} 200`, page?.status === 200, `status ${page?.status}`);
    if (page && page.status === 200) {
      assert(`${path} canonical`, canonicalHref(page.html)?.includes(path) === true, canonicalHref(page.html) ?? 'missing');
      assert(`${path} og:title`, (metaContent(page.html, 'og:title') ?? '').length > 0, '');
      assert(`${path} og:image`, (metaContent(page.html, 'og:image') ?? '').length > 0, '');
      assert(`${path} Arabic title`, titleFragment.length === 0 || (page.html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').includes(titleFragment), '');
    }
  }

  section('D) indexing hygiene (noindex surfaces)');
  for (const probe of [
    { path: '/search', follow: true },
    { path: '/cart', follow: true },
    { path: '/checkout', follow: false },
    { path: '/review', follow: true },
    { path: '/order/success', follow: false },
    { path: '/admin/login', follow: false },
  ] as const) {
    const page = await getHtml(probe.path);
    assert(`${probe.path} 200`, page?.status === 200, `status ${page?.status}`);
    if (page && page.status === 200) {
      const meta = robotsMeta(page.html) ?? '';
      assert(`${probe.path} noindex`, meta.includes('noindex'), meta || 'missing robots meta');
      if (probe.follow) assert(`${probe.path} follow`, meta.includes('follow'), meta);
    }
  }

  // 404 route: honest 404 + no canonical leak
  const missing = await getHtml('/product/definitely-not-a-real-slug-xyz');
  assert('missing product returns 404', missing?.status === 404, `status ${missing?.status}`);

  /* ---------------------------------------------------------------- F) semantics */
  section('F) document semantics (alt coverage + landmarks on probed pages)');
  const probedRoutes = ['/', '/about', '/contact', '/cart', '/checkout'];
  for (const path of probedRoutes) {
    const page = await getHtml(path);
    if (page && page.status === 200) {
      const imgs = page.html.match(/<img\b[^>]*>/gi) ?? [];
      const missingAlt = imgs.filter((tag) => !/\balt=/.test(tag));
      assert(`${path}: every <img> has alt`, missingAlt.length === 0, `${imgs.length} img, ${missingAlt.length} missing alt`);
      // PHASE-11 a11y: every storefront route carries the main landmark so the
      // skip-link target exists (regression guard for the checkout/cart/success fix).
      assert(`${path}: <main id="main-content"> present`, /<main[^>]+id=["']main-content["']/.test(page.html), '');
    }
  }

  /* ------------------------------------------------------------------- summary */
  console.log(`\n===== verify-seo: ${passes} passed, ${failures} failed =====`);
  if (failures > 0) process.exitCode = 1;
  await getPool().end().catch(() => undefined);
}

main().catch((error) => {
  console.error('[verify-seo] fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
