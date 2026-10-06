/**
 * Amira Store — category tree service (PHASE-04 task 1).
 *
 * Simple recursive tree (self-FK, MASTER_PLAN §6): parents/children, sort
 * order, activation, guarded deletes. Business rules:
 * - a category cannot become its own descendant (cycle prevention);
 * - a category with children or products cannot be deleted (DB RESTRICT is
 *   the hard guarantee; the service refuses first with an Arabic reason);
 * - slug uniqueness with automatic -2/-3 suffixes.
 */

import { and, asc, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  categories,
  products,
  type Category,
} from '@/db/schema';
import { recordAdminActivity } from '@/lib/auth/activity';
import { ensureUniqueSlug, isSlugValid, slugify } from './slug';

export class CategoryServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'CategoryServiceError';
    this.status = status;
  }
}

export type CategoryTreeNode = Category & { children: CategoryTreeNode[] };

/** Full tree, sorted by sortOrder then Arabic-aware name. */
export async function getCategoryTree(includeInactive = true): Promise<CategoryTreeNode[]> {
  const rows = includeInactive
    ? await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name))
    : await db
        .select()
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(asc(categories.sortOrder), asc(categories.name));

  const byId = new Map<string, CategoryTreeNode>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });

  const roots: CategoryTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return row ?? null;
}

export type CategorySaveInput = {
  name: string;
  slug?: string | null;
  parentId?: string | null;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export async function createCategory(
  input: CategorySaveInput,
  adminUserId: string,
): Promise<Category> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) {
    throw new CategoryServiceError('اسم القسم يجب أن يكون بين ٢ و ١٢٠ حرفًا.');
  }

  const desired = input.slug?.trim() ? slugify(input.slug) : slugify(name);
  if (!isSlugValid(desired)) {
    throw new CategoryServiceError('الرابط (slug) يجب أن يحتوي حروفًا أو أرقامًا فقط.');
  }
  const slug = await ensureUniqueSlug('categories', desired);

  if (input.parentId) {
    const parent = await getCategoryById(input.parentId);
    if (!parent) throw new CategoryServiceError('القسم الأب غير موجود.', 404);
  }

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(categories)
      .values({
        name,
        slug,
        parentId: input.parentId ?? null,
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      })
      .returning();

    await recordAdminActivity(
      {
        adminUserId,
        action: 'catalog.category.created',
        entityType: 'category',
        entityId: inserted.id,
        metadata: { slug: inserted.slug, parentId: inserted.parentId },
      },
      tx,
    );
    return inserted;
  });
  return row;
}

export async function updateCategory(
  id: string,
  input: CategorySaveInput,
  adminUserId: string,
): Promise<Category> {
  const existing = await getCategoryById(id);
  if (!existing) throw new CategoryServiceError('القسم غير موجود.', 404);

  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) {
    throw new CategoryServiceError('اسم القسم يجب أن يكون بين ٢ و ١٢٠ حرفًا.');
  }

  const desiredSlug = input.slug?.trim() ? slugify(input.slug) : slugify(name);
  let slug = existing.slug;
  if (desiredSlug !== existing.slug) {
    if (!isSlugValid(desiredSlug)) {
      throw new CategoryServiceError('الرابط (slug) يجب أن يحتوي حروفًا أو أرقامًا فقط.');
    }
    const [conflict] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, desiredSlug), ne(categories.id, id)))
      .limit(1);
    if (conflict) {
      throw new CategoryServiceError('الرابط (slug) مستخدم بالفعل لقسم آخر.');
    }
    slug = desiredSlug;
  }

  const row = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('amira:category-tree', 0))`,
    );

    const [lockedCategory] = await tx
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .for('update')
      .limit(1);
    if (!lockedCategory) throw new CategoryServiceError('القسم غير موجود.', 404);

    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === id) {
        throw new CategoryServiceError('لا يمكن جعل القسم أبًا لنفسه.');
      }

      const tree = await tx
        .select({ id: categories.id, parentId: categories.parentId })
        .from(categories);
      if (!tree.some((category) => category.id === input.parentId)) {
        throw new CategoryServiceError('القسم الأب غير موجود.', 404);
      }

      const childrenByParent = new Map<string, string[]>();
      for (const category of tree) {
        if (category.parentId) {
          const children = childrenByParent.get(category.parentId) ?? [];
          children.push(category.id);
          childrenByParent.set(category.parentId, children);
        }
      }
      const descendants = new Set<string>([id]);
      const queue = [id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const child of childrenByParent.get(current) ?? []) {
          if (descendants.has(child)) continue;
          descendants.add(child);
          queue.push(child);
        }
      }
      if (descendants.has(input.parentId)) {
        throw new CategoryServiceError('لا يمكن نقل القسم تحت أحد أقسامه الفرعية.');
      }
    }

    const [updated] = await tx
      .update(categories)
      .set({
        name,
        slug,
        parentId: input.parentId === undefined ? lockedCategory.parentId : input.parentId,
        description: input.description === undefined ? lockedCategory.description : input.description?.trim() || null,
        sortOrder: input.sortOrder ?? lockedCategory.sortOrder,
        isActive: input.isActive ?? lockedCategory.isActive,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, id))
      .returning();

    await recordAdminActivity(
      {
        adminUserId,
        action: 'catalog.category.updated',
        entityType: 'category',
        entityId: id,
        metadata: { slug: updated.slug },
      },
      tx,
    );
    return updated;
  });
  return row;
}

/** Bulk reorder (admin tree UI sends the full visible order). */
export async function reorderCategories(
  orderedIds: string[],
  adminUserId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(categories)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(eq(categories.id, id));
    }
    await recordAdminActivity(
      {
        adminUserId,
        action: 'catalog.category.reordered',
        entityType: 'category',
        entityId: null,
        metadata: { count: orderedIds.length },
      },
      tx,
    );
  });
}

export async function deleteCategory(id: string, adminUserId: string): Promise<void> {
  const existing = await getCategoryById(id);
  if (!existing) throw new CategoryServiceError('القسم غير موجود.', 404);

  const [child] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, id))
    .limit(1);
  if (child) {
    throw new CategoryServiceError('لا يمكن حذف قسم يحتوي أقسامًا فرعية. انقل الأقسام الفرعية أولًا.');
  }

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, id))
    .limit(1);
  if (product) {
    throw new CategoryServiceError('لا يمكن حذف قسم مرتبط بمنتجات. انقل المنتجات لقسم آخر أو أرشفها.');
  }

  await db.transaction(async (tx) => {
    await tx.delete(categories).where(eq(categories.id, id));
    await recordAdminActivity(
      {
        adminUserId,
        action: 'catalog.category.deleted',
        entityType: 'category',
        entityId: id,
        metadata: { slug: existing.slug },
      },
      tx,
    );
  });
}
