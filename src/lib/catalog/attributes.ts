/**
 * Amira Store — generic attribute definitions + values (PHASE-04 tasks 3 & 6).
 *
 * Attributes (size/color/volume/shade/material/style …) are global reusable
 * definitions; values belong to exactly one attribute. Rules:
 * - UNIQUE(attribute, slug) — no duplicate value inside one attribute (DB);
 * - an attribute or a value that is already attached to any variant cannot be
 *   deleted (variant_attribute_values cascades would silently strip variant
 *   definitions — refused here first with an Arabic reason);
 * - renaming keeps history: values are referenced by id, never by text.
 */

import { and, asc, count, eq, inArray } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  attributeValues,
  attributes,
  variantAttributeValues,
  type Attribute,
  type AttributeValue,
} from '@/db/schema';
import { recordAdminActivity } from '@/lib/auth/activity';
import { isSlugValid, slugify } from './slug';

export class AttributeServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'AttributeServiceError';
    this.status = status;
  }
}

export type AttributeWithValues = Attribute & { values: AttributeValue[] };

export async function listAttributesWithValues(): Promise<AttributeWithValues[]> {
  const attributeRows = await db
    .select()
    .from(attributes)
    .orderBy(asc(attributes.sortOrder), asc(attributes.name));
  if (attributeRows.length === 0) return [];

  const valueRows = await db
    .select()
    .from(attributeValues)
    .orderBy(asc(attributeValues.sortOrder), asc(attributeValues.value));

  const byAttribute = new Map<string, AttributeValue[]>();
  for (const value of valueRows) {
    const list = byAttribute.get(value.attributeId) ?? [];
    list.push(value);
    byAttribute.set(value.attributeId, list);
  }
  return attributeRows.map((attribute) => ({
    ...attribute,
    values: byAttribute.get(attribute.id) ?? [],
  }));
}

function normalizeAttributeName(name: string): { name: string; slug: string } {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 60) {
    throw new AttributeServiceError('اسم الخاصية يجب أن يكون بين ٢ و ٦٠ حرفًا.');
  }
  const slug = slugify(trimmed);
  if (!isSlugValid(slug)) {
    throw new AttributeServiceError('اسم الخاصية يجب أن يحتوي حروفًا أو أرقامًا فقط.');
  }
  return { name: trimmed, slug };
}

export async function createAttribute(
  input: { name: string; sortOrder?: number },
  adminUserId: string,
): Promise<Attribute> {
  const { name, slug } = normalizeAttributeName(input.name);
  const [conflict] = await db
    .select({ id: attributes.id })
    .from(attributes)
    .where(eq(attributes.slug, slug))
    .limit(1);
  if (conflict) throw new AttributeServiceError('خاصية بنفس الرابط موجودة بالفعل.');

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(attributes)
      .values({ name, slug, sortOrder: input.sortOrder ?? 0 })
      .returning();

    await recordAdminActivity(
      {
        adminUserId,
        action: 'catalog.attribute.created',
        entityType: 'attribute',
        entityId: row.id,
        metadata: { slug: row.slug },
      },
      tx,
    );
    return row;
  });
}

export async function createAttributeValue(
  attributeId: string,
  input: { value: string; sortOrder?: number },
  adminUserId: string,
): Promise<AttributeValue> {
  const value = input.value.trim();
  if (value.length < 1 || value.length > 80) {
    throw new AttributeServiceError('قيمة الخاصية يجب أن تكون بين ١ و ٨٠ حرفًا.');
  }
  const [attribute] = await db
    .select({ id: attributes.id })
    .from(attributes)
    .where(eq(attributes.id, attributeId))
    .limit(1);
  if (!attribute) throw new AttributeServiceError('الخاصية غير موجودة.', 404);

  const slug = slugify(value);
  if (!isSlugValid(slug)) {
    throw new AttributeServiceError('قيمة الخاصية يجب أن تحتوي حروفًا أو أرقامًا فقط.');
  }
  // Dictionary: UNIQUE(attribute_id, slug) — duplicates are scoped per attribute.
  const [conflict] = await db
    .select({ id: attributeValues.id })
    .from(attributeValues)
    .where(
      and(eq(attributeValues.attributeId, attributeId), eq(attributeValues.slug, slug)),
    )
    .limit(1);
  if (conflict) {
    throw new AttributeServiceError('قيمة مطابقة موجودة بالفعل في هذه الخاصية.');
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(attributeValues)
      .values({ attributeId, value, slug, sortOrder: input.sortOrder ?? 0 })
      .returning();

    await recordAdminActivity(
      {
        adminUserId,
        action: 'catalog.attribute_value.created',
        entityType: 'attribute_value',
        entityId: row.id,
        metadata: { attributeId, value: row.value },
      },
      tx,
    );
    return row;
  });
}

export async function deleteAttribute(id: string, adminUserId: string): Promise<void> {
  const [existing] = await db.select().from(attributes).where(eq(attributes.id, id)).limit(1);
  if (!existing) throw new AttributeServiceError('الخاصية غير موجودة.', 404);

  const valueIds = (
    await db.select({ id: attributeValues.id }).from(attributeValues).where(eq(attributeValues.attributeId, id))
  ).map((row) => row.id);

  if (valueIds.length > 0) {
    const [used] = await db
      .select({ n: count() })
      .from(variantAttributeValues)
      .where(inArray(variantAttributeValues.attributeValueId, valueIds));
    if ((used?.n ?? 0) > 0) {
      throw new AttributeServiceError(
        'لا يمكن حذف خاصية مستخدمة في متغيرات المنتجات. أرشف المنتجات المرتبطة أولًا.',
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(attributes).where(eq(attributes.id, id)); // values cascade (unused)
    await recordAdminActivity(
      {
        adminUserId,
        action: 'catalog.attribute.deleted',
        entityType: 'attribute',
        entityId: id,
        metadata: { slug: existing.slug },
      },
      tx,
    );
  });
}

export async function deleteAttributeValue(id: string, adminUserId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(attributeValues)
    .where(eq(attributeValues.id, id))
    .limit(1);
  if (!existing) throw new AttributeServiceError('قيمة الخاصية غير موجودة.', 404);

  const [used] = await db
    .select({ n: count() })
    .from(variantAttributeValues)
    .where(eq(variantAttributeValues.attributeValueId, id));
  if ((used?.n ?? 0) > 0) {
    throw new AttributeServiceError(
      'لا يمكن حذف قيمة مستخدمة في متغيرات المنتجات. عدّل المتغيرات المرتبطة أولًا.',
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(attributeValues).where(eq(attributeValues.id, id));
    await recordAdminActivity(
      {
        adminUserId,
        action: 'catalog.attribute_value.deleted',
        entityType: 'attribute_value',
        entityId: id,
        metadata: { attributeId: existing.attributeId },
      },
      tx,
    );
  });
}
