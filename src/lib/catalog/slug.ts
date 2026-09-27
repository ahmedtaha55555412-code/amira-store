/**
 * Amira Store — slug generation + uniqueness (PHASE-04).
 *
 * Arabic-first store: slugs preserve Arabic letters (valid, SEO-fine, and
 * already the pattern used by the PHASE-02 seed for latin demo slugs).
 * Latin letters/digits are lowercased; spaces/underscores become hyphens;
 * anything that is not an Arabic letter, latin letter, digit, or hyphen is
 * dropped. Conflicts are resolved with -2, -3 … suffixes at the service
 * level (DB unique indexes remain the hard guarantee).
 */

const SLUG_ALLOWED = /[^a-z0-9\u0621-\u064A-]+/g;

export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(SLUG_ALLOWED, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
    .replace(/^-|-$/g, '');
  return base;
}

export function isSlugValid(slug: string): boolean {
  return (
    slug.length >= 1 &&
    slug.length <= 120 &&
    /^[a-z0-9\u0621-\u064A]+(-[a-z0-9\u0621-\u064A]+)*$/.test(slug)
  );
}

/** Uniqueness probe used by the category/product services. */
export async function ensureUniqueSlug(
  table: 'categories' | 'products',
  desired: string,
  options?: { excludeId?: string },
): Promise<string> {
  const { eq, and, ne } = await import('drizzle-orm');
  const { categories, products } = await import('@/db/schema');
  const { db } = await import('@/db/client');

  const target = table === 'categories' ? categories : products;
  const slugColumn = target.slug;

  let candidate = desired;
  for (let attempt = 2; attempt < 200; attempt += 1) {
    const conditions = [eq(slugColumn, candidate)];
    if (options?.excludeId) conditions.push(ne(target.id, options.excludeId));
    const [row] = await db
      .select({ id: target.id })
      .from(target)
      .where(and(...conditions))
      .limit(1);
    if (!row) return candidate;
    candidate = `${desired}-${attempt}`;
  }
  throw new Error(`تعذر توليد عنوان فريد للرابط (${table}).`);
}
