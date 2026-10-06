/**
 * Amira Store — single source of truth for public product/category reachability.
 *
 * A storefront product is eligible only when:
 * - product.status = active;
 * - its category is on a fully-active ancestor chain;
 * - it owns at least one active variant.
 *
 * Keeping the category reachability calculation here prevents category counts,
 * listings, search, PDP probes and sitemap generation from drifting apart.
 */

import { eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { categories, productVariants, products } from '@/db/schema';

export const hasActiveVariantSql = sql<boolean>`exists(
  select 1
  from ${productVariants}
  where ${productVariants.productId} = ${products.id}
    and ${productVariants.isActive} = true
)`;

/** Return all active category ids whose complete ancestor chain is active. */
export async function getReachableActiveCategoryIds(): Promise<Set<string>> {
  const rows = await db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.isActive, true));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const memo = new Map<string, boolean>();

  const visit = (id: string, trail: Set<string>): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (trail.has(id)) {
      memo.set(id, false);
      return false;
    }

    const row = byId.get(id);
    if (!row) {
      memo.set(id, false);
      return false;
    }

    if (row.parentId === null) {
      memo.set(id, true);
      return true;
    }

    const nextTrail = new Set(trail);
    nextTrail.add(id);
    const reachable = visit(row.parentId, nextTrail);
    memo.set(id, reachable);
    return reachable;
  };

  const reachable = new Set<string>();
  for (const row of rows) if (visit(row.id, new Set())) reachable.add(row.id);
  return reachable;
}

/** Guard a set of caller-supplied category ids against inactive/unreachable branches. */
export function restrictToReachableCategoryIds(
  requested: string[] | undefined,
  reachable: Set<string>,
): string[] {
  if (requested === undefined) return [...reachable];
  return requested.filter((id) => reachable.has(id));
}

