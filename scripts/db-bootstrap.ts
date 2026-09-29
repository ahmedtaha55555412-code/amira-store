/**
 * Amira Store — PRODUCTION-SAFE database bootstrap (docs/ops/SEED_PLAN.md).
 *
 * One-time (idempotent) command for real environments. It:
 *  1. verifies database connectivity;
 *  2. verifies migrations are current (applied == repository journal);
 *  3. initializes the store_settings singleton IF ABSENT (Arabic/RTL/EGP
 *     defaults + WhatsApp number +201019003677 as store data);
 *  4. initializes the five main categories IF ABSENT;
 *  5. exits WITHOUT touching products/orders/customers/inventory/reviews.
 *
 * It NEVER prints passwords or connection strings, NEVER seeds demo content,
 * and NEVER creates admin accounts (that is PHASE-03's admin bootstrap).
 *
 * Run: bun run db:bootstrap   (works in any environment; production-safe)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import { categories, homepageSections, storeSettings } from '../src/db/schema';

/* -------------------------------------------------------------------------- */
/* 1. Connectivity                                                             */
/* -------------------------------------------------------------------------- */

try {
  await db.execute(sql`SELECT 1`);
} catch (error) {
  console.error(
    '[db-bootstrap] REFUSED: cannot connect to the database. Check DATABASE_URL.',
  );
  console.error('[db-bootstrap] Never commit connection strings or secrets.');
  throw error;
}
console.log('[db-bootstrap] connectivity ✔');

/* -------------------------------------------------------------------------- */
/* 2. Migrations current                                                       */
/* -------------------------------------------------------------------------- */

const here = path.dirname(fileURLToPath(import.meta.url));
const journalPath = path.resolve(here, '../drizzle/meta/_journal.json');
const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
  entries: { tag: string }[];
};
const journalCount = journal.entries.length;

const appliedResult = await db.execute<{ n: number }>(
  sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
);
const appliedCount = appliedResult.rows[0]?.n ?? 0;

if (appliedCount !== journalCount) {
  console.error(
    `[db-bootstrap] REFUSED: migrations not current (applied=${appliedCount}, repository=${journalCount}).`,
  );
  console.error('[db-bootstrap] Run `bun run db:migrate` first.');
  process.exit(1);
}
console.log(`[db-bootstrap] migrations current ✔ (${appliedCount} applied)`);

/* -------------------------------------------------------------------------- */
/* 3. Store settings singleton (only if absent)                                */
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

await db
  .insert(storeSettings)
  .values({
    id: 1,
    storeName: 'أميرة استور',
    whatsappPhone: '+201019003677',
    whatsappMessageTemplate: DEFAULT_WHATSAPP_TEMPLATE,
    currencyCode: 'EGP',
    locale: 'ar',
    timezone: 'Africa/Cairo',
  })
  .onConflictDoNothing({ target: storeSettings.id });

const settings = await db
  .select({ id: storeSettings.id, whatsapp: storeSettings.whatsappPhone })
  .from(storeSettings)
  .limit(1);
if (settings.length !== 1) {
  console.error('[db-bootstrap] FAILED: settings row missing after init.');
  process.exit(1);
}
console.log(
  '[db-bootstrap] store_settings ✔ (WhatsApp number present as store data; existing values untouched)',
);

/* -------------------------------------------------------------------------- */
/* 4. Five main categories (only if absent)                                    */
/* -------------------------------------------------------------------------- */

const mainCategories = [
  { slug: 'women', name: 'نسائي' },
  { slug: 'men', name: 'رجالي' },
  { slug: 'kids', name: 'أطفال' },
  { slug: 'baby', name: 'مواليد' },
  { slug: 'cosmetics', name: 'مستحضرات تجميل' },
] as const;

for (const [i, c] of mainCategories.entries()) {
  await db
    .insert(categories)
    .values({ slug: c.slug, name: c.name, sortOrder: i })
    .onConflictDoNothing({ target: categories.slug });
}
console.log('[db-bootstrap] five main categories ✔ (absent-only)');

/* -------------------------------------------------------------------------- */
/* 5. Homepage section vocabulary (only if absent) — PHASE-10 (D-1)            */
/* -------------------------------------------------------------------------- */
/**
 * The code-limited section key vocabulary (single source of truth lives in
 * src/lib/admin/homepage.ts — duplicated here as a literal so the bootstrap
 * stays dependency-free). Absent-only insert: existing rows (including any
 * admin-curated titles/config) are NEVER overwritten, and no row is ever
 * deleted — a destructive overwrite would destroy owner content. Products
 * remain query-driven; no product-selection flag exists in this model.
 */

const HOMEPAGE_SECTIONS = [
  { key: 'announcement', title: 'شريط الإعلانات' },
  { key: 'hero', title: 'البانر الرئيسي' },
  { key: 'categories', title: 'الأقسام' },
  { key: 'new_arrivals', title: 'وصل حديثًا' },
  { key: 'offers', title: 'العروض' },
  { key: 'benefits', title: 'لماذا أميرة استور' },
  { key: 'brand_story', title: 'قصتنا' },
  { key: 'reviews', title: 'تقييمات العملاء' },
  { key: 'testimonials', title: 'آراء عملائنا على واتساب' },
  { key: 'whatsapp_cta', title: 'تواصلي معنا' },
] as const;

for (const [i, s] of HOMEPAGE_SECTIONS.entries()) {
  await db
    .insert(homepageSections)
    .values({ sectionKey: s.key, title: s.title, sortOrder: i })
    .onConflictDoNothing({ target: homepageSections.sectionKey });
}
const sectionRows = await db
  .select({ n: sql<number>`count(*)::int` })
  .from(homepageSections);
console.log(
  `[db-bootstrap] homepage sections ✔ (${sectionRows[0]?.n ?? 0} rows present; absent-only)`,
);

/* -------------------------------------------------------------------------- */
/* Done — nothing else is touched                                              */
/* -------------------------------------------------------------------------- */

console.log('[db-bootstrap] DONE — products/orders/customers/inventory untouched.');

await getPool().end();
