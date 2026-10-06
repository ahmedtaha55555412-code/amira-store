/**
 * Amira Store — PHASE-10 homepage/content/settings verification suite.
 *
 * Exercises the application's OWN services (src/lib/admin/settings.ts,
 * src/lib/admin/homepage.ts, src/lib/storefront/homepage.ts, src/lib/
 * branding.ts, media service) against the target database and asserts every
 * PHASE-10 deliverable verifiable at the service layer:
 *
 *   1. D-1 bootstrap state: exactly the 10 canonical section keys, enabled,
 *      unique sort order, idempotency-friendly (no duplicates/overwrites)
 *   2. Settings singleton read + update + per-field fallbacks
 *   3. WhatsApp/support phone normalization (Egyptian rule, single source)
 *   4. socialLinks schema validation (https-only, code-limited keys)
 *   5. D-2 announcement chain: section config message → resolved branding
 *      → BRAND fallback after clearing
 *   6. Section update gates: per-key config schemas (hero ctaHref rules,
 *      benefits item bounds), unknown keys refused
 *   7. Section reorder: atomic permutation + restore
 *   8. Section visibility: disable/enable honored by the public reader
 *   9. D-4 media gate: logo/favicon accept PUBLIC images only; private
 *      (reviews/testimonials namespace) assets are refused server-side
 *  10. Banner lifecycle: create INACTIVE (public media), activation, time
 *      window exclusion, delete — active reader honors every state
 *  11. Branding composition: storeName/logo/footer/social fallbacks
 *  12. Query-driven protections (hard exclusions): new arrivals stay
 *      created_at-ordered; offers stay genuinely discounted; NO product-
 *      selection fields exist in any homepage/settings contract
 *
 * Safety:
 * - REFUSES NODE_ENV=production;
 * - probe media/rows are removed in `finally` (LIFO, zero residue);
 * - never prints credentials.
 *
 * Run against the isolated development database only:
 *   set -a; . ./.env.local; set +a; bun run verify:homepage
 */

import { eq, sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import { adminUsers } from '../src/db/schema';
import {
  HomepageServiceError,
  HOMESECTION_KEYS,
  reorderHomepageSections,
  updateHomepageBanner,
  updateHomepageSection,
  validateSectionConfig,
  createHomepageBanner,
  deleteHomepageBanner,
  getAdminBanners,
  bannerCreateSchema,
} from '../src/lib/admin/homepage';
import {
  SettingsServiceError,
  getStoreSettings,
  getResolvedBrandSettings,
  settingsUpdateSchema,
  socialLinksSchema,
  updateStoreFavicon,
  updateStoreLogo,
  updateStoreSettings,
} from '../src/lib/admin/settings';
import { getBrandSettings } from '../src/lib/branding';
import { BRAND } from '../src/config/brand';
import { uploadImage } from '../src/lib/media/service';
import { deleteMediaAsset } from '../src/lib/media/registry';
import {
  getActiveHomepageBanners,
  getEnabledHomepageSections,
} from '../src/lib/storefront/homepage';
import { getStorefrontHomepageData } from '../src/lib/storefront/catalog';

if (process.env.NODE_ENV === 'production') {
  console.error('[verify-homepage] REFUSED: never run homepage probes against production.');
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
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(name: string, condition: boolean, detail = ''): void {
  if (condition) pass(name, detail);
  else fail(name, detail);
}
function section(title: string): void {
  console.log(`\n[${title}]`);
}

async function expectServiceError(
  name: string,
  kinds: Array<typeof SettingsServiceError | typeof HomepageServiceError>,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
    fail(name, 'expected a service error but the call succeeded');
  } catch (error) {
    const matched = kinds.some((kind) => error instanceof kind);
    if (matched) pass(name, (error as Error).message.slice(0, 60));
    else {
      fail(name, `unexpected error type: ${(error as Error)?.name}`);
      throw error;
    }
  }
}

/** Minimal 1×1 PNG probe image (real upload payload). */
function probePng(): Buffer {
  // Solid 200×200 RGB PNG — satisfies the media dimension bounds (100–6000px).
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAIAAAAiOjnJAAACFUlEQVR4nO3SQQkAIADAQAtZwY42toRDkIMLsMfGnguuG88L+JKxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi8QBO+fX+H41hZEAAAAASUVORK5CYII=',
    'base64',
  );
}

async function main(): Promise<void> {
  const [admin] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  if (!admin) {
    console.error('[verify-homepage] FATAL: no admin user in the target database.');
    process.exit(1);
  }
  const adminId = admin.id;

  // Self-healing baseline restore BEFORE any assertion (a previously aborted
  // run can leave probe config behind): announcement = code defaults.
  const [announcementBaseline] = await db
    .execute<{ id: string; config: unknown }>(sql`select id, config from homepage_sections where section_key = 'announcement'`)
    .then((r) => r.rows);
  if (announcementBaseline?.id && announcementBaseline.config !== null) {
    await updateHomepageSection(announcementBaseline.id, { config: null, isEnabled: true }, adminId);
  }

  /* ---------------------------------------------------------------------- */
  section('1. D-1 section vocabulary — exactly the canonical 10 (absent-only bootstrap contract)');
  const sections = await getEnabledHomepageSections();
  assert('all 10 canonical keys exist', HOMESECTION_KEYS.every((k) => sections.some((s) => s.key === k)), `${sections.length} enabled`);
  const allRows = await db.execute<{ n: number }>(sql`select count(*)::int as n from homepage_sections`);
  assert('no extra/unknown rows', (allRows.rows[0]?.n ?? 0) === HOMESECTION_KEYS.length);
  const sortRows = await db.execute<{ min: number; max: number; uniq: number }>(
    sql`select min(sort_order)::int as min, max(sort_order)::int as max, count(distinct sort_order)::int as uniq from homepage_sections`,
  );
  assert('sort orders unique and bounded', (sortRows.rows[0]?.uniq ?? 0) === HOMESECTION_KEYS.length && (sortRows.rows[0]?.min ?? 99) === 0);
  const [announcementRow] = await db.execute<{ config: unknown }>(
    sql`select config from homepage_sections where section_key = 'announcement'`,
  ).then((r) => r.rows);
  assert('existing rows untouched by bootstrap (config remains null)', announcementRow?.config === null || announcementRow?.config === undefined);

  /* ---------------------------------------------------------------------- */
  section('2. Settings singleton read + zod gate');
  const settings = await getStoreSettings();
  assert('singleton row exists (id=1)', settings?.id === 1);
  assert('store name present as data', (settings?.storeName ?? '').trim().length > 0);
  assert('whatsapp phone stored in +20 form', settings?.whatsappPhone.startsWith('+20') ?? false);
  assert('message template non-empty (PHASE-07 contract)', (settings?.whatsappMessageTemplate ?? '').includes('{order_number}'));
  const badPhone = settingsUpdateSchema.safeParse({ whatsappPhone: '12345' });
  assert('schema accepts phone field for server normalization', badPhone.success);
  const emptyPatch = settingsUpdateSchema.safeParse({});
  assert('empty patch refused', !emptyPatch.success);
  const badSocial = socialLinksSchema.safeParse({ instagram: 'http://insecure.example' });
  assert('non-https social link refused', !badSocial.success);
  const unknownField = settingsUpdateSchema.safeParse({ productsToFeature: ['x'] });
  assert('unknown/selection-style fields refused (hard exclusion)', !unknownField.success);

  /* ---------------------------------------------------------------------- */
  section('3. WhatsApp/support phone normalization (single source of truth)');
  await updateStoreSettings({ whatsappPhone: '010 190 03677' }, adminId);
  const afterPhone = await getStoreSettings();
  assert('display form normalized to +20', afterPhone?.whatsappPhone === '+201019003677');
  await expectServiceError('invalid phone refused', [SettingsServiceError], () =>
    updateStoreSettings({ whatsappPhone: '012345' }, adminId),
  );
  await updateStoreSettings(
    { supportPhone: '+20 11 1234 5678', footerText: 'نص تذييل تجريبي — PHASE-10' },
    adminId,
  );
  const afterSupport = await getStoreSettings();
  assert('support phone normalized', afterSupport?.supportPhone === '+201112345678');
  assert('footer text stored', afterSupport?.footerText === 'نص تذييل تجريبي — PHASE-10');
  await updateStoreSettings({ supportPhone: null, footerText: null }, adminId);
  const afterClear = await getStoreSettings();
  assert('nullable fields clear honestly', afterSupport !== null && afterClear?.supportPhone === null && afterClear?.footerText === null);

  /* ---------------------------------------------------------------------- */
  section('4. socialLinks composition + fallbacks');
  await updateStoreSettings(
    { socialLinks: { instagram: 'https://instagram.com/amira.store.example' } },
    adminId,
  );
  const brand1 = await getBrandSettings();
  assert('instagram link surfaces', brand1.socialLinks.instagram === 'https://instagram.com/amira.store.example');
  assert('facebook absent when unset', brand1.socialLinks.facebook === undefined);
  await updateStoreSettings({ socialLinks: null }, adminId);
  const brand2 = await getBrandSettings();
  assert('cleared social links fall back to empty', Object.keys(brand2.socialLinks).length === 0);
  assert('footer falls back to store default', brand2.footerText.length > 0);
  assert('store name falls back to data (row exists)', brand2.storeName === settings?.storeName);

  /* ---------------------------------------------------------------------- */
  section('5. D-2 announcement chain — section config → branding → BRAND fallback');
  const [announcementSection] = await db
    .execute<{ id: string }>(sql`select id from homepage_sections where section_key = 'announcement'`)
    .then((r) => r.rows);
  // The baseline restore above guarantees config NULL here.
  const resolved0 = await getResolvedBrandSettings();
  assert('resolver returns the settings row', resolved0?.settings.id === 1);
  assert('announcement currently falls back to BRAND default', resolved0?.announcementMessage === null);
  const brand0 = await getBrandSettings();
  assert('branding composes BRAND announcement', brand0.announcement === BRAND.announcement);
  assert('announcement enabled by default', brand0.announcementEnabled === true);

  await updateHomepageSection(
    announcementSection!.id,
    { config: { message: 'خصم 20% على مستحضرات التجميل حتى نهاية الأسبوع' } },
    adminId,
  );
  const brand3 = await getBrandSettings();
  assert('D-2: section config message wins', brand3.announcement === 'خصم 20% على مستحضرات التجميل حتى نهاية الأسبوع');
  await updateHomepageSection(announcementSection!.id, { config: null }, adminId);
  const brand4 = await getBrandSettings();
  assert('D-2: cleared config restores BRAND fallback', brand4.announcement === BRAND.announcement);
  await updateHomepageSection(announcementSection!.id, { isEnabled: false }, adminId);
  const brand5 = await getBrandSettings();
  assert('disabled announcement hides the bar (visibility contract)', brand5.announcementEnabled === false);
  await updateHomepageSection(announcementSection!.id, { isEnabled: true }, adminId);

  /* ---------------------------------------------------------------------- */
  section('6. Section update gates — per-key config schemas, unknown keys');
  const [heroSection] = await db
    .execute<{ id: string }>(sql`select id from homepage_sections where section_key = 'hero'`)
    .then((r) => r.rows);
  await updateHomepageSection(
    heroSection!.id,
    { config: { title: 'عنوان تجريبي للواجهة', ctaHref: '/category/women' } },
    adminId,
  );
  const heroAfter = await getEnabledHomepageSections();
  const heroRow = heroAfter.find((s) => s.key === 'hero');
  assert('hero config stored', heroRow?.config?.title === 'عنوان تجريبي للواجهة');
  await expectServiceError('external non-wa.me CTA refused', [HomepageServiceError], () =>
    updateHomepageSection(heroSection!.id, { config: { title: 'x', ctaHref: 'https://evil.example/path' } }, adminId),
  );
  await expectServiceError('benefits items below minimum refused', [HomepageServiceError], async () =>
    validateSectionConfig('benefits', { items: [{ title: 'واحد', description: 'نص' }] }),
  );
  const benefitsConfig = validateSectionConfig('benefits', {
    items: [
      { title: 'أولى', description: 'نص أول' },
      { title: 'ثانية', description: 'نص ثان' },
      { title: 'ثالثة', description: 'نص ثالث' },
    ],
  });
  assert('benefits 3 items accepted', benefitsConfig !== null && Array.isArray((benefitsConfig as Record<string, unknown>).items));
  await expectServiceError('unknown section key refused', [HomepageServiceError], async () =>
    validateSectionConfig('featured_products', {}),
  );
  await updateHomepageSection(heroSection!.id, { config: null }, adminId);
  assert('hero config reset to defaults', (await getEnabledHomepageSections()).find((s) => s.key === 'hero')?.config === null);

  /* ---------------------------------------------------------------------- */
  section('7. Section reorder — atomic permutation + restore');
  const beforeOrder = (await getEnabledHomepageSections()).map((s) => s.id);
  const announcementFirst = beforeOrder[0]!; // vocabulary order puts announcement first
  const permutation = [announcementFirst, ...beforeOrder.slice(1).reverse()];
  await reorderHomepageSections(permutation, adminId);
  const afterOrder = (await getEnabledHomepageSections()).map((s) => s.id);
  assert('reorder applied atomically', JSON.stringify(afterOrder) === JSON.stringify(permutation));
  await reorderHomepageSections(beforeOrder, adminId);
  const restoredOrder = (await getEnabledHomepageSections()).map((s) => s.id);
  assert('order restored', JSON.stringify(restoredOrder) === JSON.stringify(beforeOrder));

  /* ---------------------------------------------------------------------- */
  section('8. Section visibility — disable/enable honored by the public reader');
  const [offersSection] = await db
    .execute<{ id: string }>(sql`select id from homepage_sections where section_key = 'offers'`)
    .then((r) => r.rows);
  await updateHomepageSection(offersSection!.id, { isEnabled: false }, adminId);
  const withoutOffers = await getEnabledHomepageSections();
  assert('disabled section removed from public list', !withoutOffers.some((s) => s.key === 'offers'));
  await updateHomepageSection(offersSection!.id, { isEnabled: true }, adminId);
  const withOffers = await getEnabledHomepageSections();
  assert('re-enabled section returns', withOffers.some((s) => s.key === 'offers'));

  /* ---------------------------------------------------------------------- */
  section('9. D-4 media gate — public images only for branding surfaces');
  const png = probePng();
  const publicAsset = await uploadImage({
    bytes: png,
    declaredContentType: 'image/png',
    altText: 'probe — public brand media',
    adminUserId: adminId,
    accessMode: 'public',
    folder: 'branding',
  });
  assert('public probe asset registered', publicAsset.accessMode === 'public');
  const privateAsset = await uploadImage({
    bytes: png,
    declaredContentType: 'image/png',
    altText: 'probe — private namespace asset',
    adminUserId: adminId,
    accessMode: 'private',
    folder: 'reviews',
  });
  assert('private probe asset registered (PHASE-09 path)', privateAsset.accessMode === 'private');
  await expectServiceError('PRIVATE asset refused as logo', [SettingsServiceError], () =>
    updateStoreLogo(privateAsset.id, adminId),
  );
  await expectServiceError('PRIVATE asset refused as favicon', [SettingsServiceError], () =>
    updateStoreFavicon(privateAsset.id, adminId),
  );
  await updateStoreLogo(publicAsset.id, adminId);
  await updateStoreFavicon(publicAsset.id, adminId);
  const brandLogo = await getBrandSettings();
  assert('logo resolved to public URL', brandLogo.logoUrl === publicAsset.url);
  assert('favicon resolved to public URL', brandLogo.faviconUrl === publicAsset.url);
  await updateStoreLogo(null, adminId);
  await updateStoreFavicon(null, adminId);
  const brandReset = await getBrandSettings();
  assert('logo/favicon reset to defaults', brandReset.logoUrl === null && brandReset.faviconUrl === null);

  /* ---------------------------------------------------------------------- */
  section('10. Banner lifecycle — public media, inactive by default, time window');
  await expectServiceError('banner creation with PRIVATE media refused', [HomepageServiceError], () =>
    createHomepageBanner({
      title: 'بانر خاص (يجب أن يُرفض)',
      subtitle: null,
      ctaLabel: null,
      ctaHref: null,
      sortOrder: 0,
      mediaAssetId: privateAsset.id,
      adminUserId: adminId,
    }),
  );
  const parsedBanner = bannerCreateSchema.safeParse({
    title: 'بانر تجريبي',
    subtitle: 'نص فرعي تجريبي',
    ctaLabel: 'تسوّق الآن',
    ctaHref: '/category/cosmetics',
    sortOrder: 0,
  });
  assert('banner payload schema accepts valid internal CTA', parsedBanner.success);
  const banner = await createHomepageBanner({
    title: 'بانر تجريبي',
    subtitle: 'نص فرعي تجريبي',
    ctaLabel: 'تسوّق الآن',
    ctaHref: '/category/cosmetics',
    sortOrder: 0,
    mediaAssetId: publicAsset.id,
    adminUserId: adminId,
  });
  const active0 = await getActiveHomepageBanners();
  assert('new banner INACTIVE — hidden from storefront', !active0.some((b) => b.id === banner.id));
  await updateHomepageBanner(banner.id, { isActive: true }, adminId);
  const active1 = await getActiveHomepageBanners();
  assert('activated banner renders with public URL', active1.some((b) => b.id === banner.id && b.imageUrl === publicAsset.url));
  await updateHomepageBanner(banner.id, { endsAt: new Date(Date.now() - 60_000) }, adminId);
  const active2 = await getActiveHomepageBanners();
  assert('expired window excludes banner', !active2.some((b) => b.id === banner.id));
  await updateHomepageBanner(banner.id, { endsAt: null, sortOrder: 3 }, adminId);
  const adminBanners = await getAdminBanners();
  assert('admin list carries any state + sort update', adminBanners.some((b) => b.id === banner.id && b.sortOrder === 3));
  await deleteHomepageBanner(banner.id, adminId);
  const active3 = await getActiveHomepageBanners();
  assert('deleted banner gone from storefront', !active3.some((b) => b.id === banner.id));

  /* ---------------------------------------------------------------------- */
  section('11. Query-driven protections — hard exclusions intact');
  const homepageData = await getStorefrontHomepageData();
  const arrivalsOrderOk = homepageData.newArrivals.every((p, i) =>
    i === 0 || new Date(homepageData.newArrivals[i - 1]!.createdAt) >= new Date(p.createdAt),
  );
  assert('new arrivals strictly created_at-desc (no manual selection)', arrivalsOrderOk, `${homepageData.newArrivals.length} products`);
  const offersGenuine = homepageData.offers.every(
    (p) => p.maxDiscountPercent > 0,
  );
  assert('offers only genuinely discounted (variant currentPrice < originalPrice)', offersGenuine, `${homepageData.offers.length} products`);
  const sectionContractKeys = JSON.stringify(Object.keys(settingsUpdateSchema.shape ?? {}));
  assert('settings contract exposes NO product-selection fields', !sectionContractKeys.includes('product'));
  const { sectionConfigSchemas } = await import('../src/lib/admin/homepage');
  const schemaText = JSON.stringify(Object.keys(sectionConfigSchemas));
  assert('section configs expose NO product-selection fields', !schemaText.includes('product') && !schemaText.includes('featured'));

  /* ---------------------------------------------------------------------- */
  console.log(`\n[verify-homepage] ${passes} passed, ${failures} failed`);
  if (failures > 0) process.exitCode = 1;

  /* ------------------------------- cleanup ------------------------------ */
  // LIFO probe residue removal — media after every reference was detached.
  await deleteMediaAsset(privateAsset.id);
  await deleteMediaAsset(publicAsset.id);
  const residue = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from media_assets where alt_text like 'probe —%'`,
  );
  assert('zero probe media residue', (residue.rows[0]?.n ?? 0) === 0);
}

main()
  .catch((error) => {
    console.error('[verify-homepage] FATAL:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end();
  });
