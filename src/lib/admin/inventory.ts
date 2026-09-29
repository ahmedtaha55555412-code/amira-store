/**
 * Amira Store — admin inventory stock adjustment (PHASE-12).
 *
 * MASTER_PLAN PHASE-12 "Inventory: manual adjustment with reason". The
 * inventory screen was read-only through PHASE-08 by design (the ledger
 * recorded only order-domain movements); PHASE-12 adds the ONE sanctioned
 * manual mutation, with every guarantee the order domain already enforces:
 *
 * - Server-authorized (route: guardJsonMutation + requireAdminMutation) and
 *   zod-validated — the client can never choose to skip the reason.
 * - MANDATORY admin-typed reason (3..300 chars) — stored on the
 *   `inventory_movements` row itself (the audit ledger) AND reflected in the
 *   admin_activity_logs metadata. Silent stock mutation is impossible.
 * - ONE transaction: row-locked read (FOR UPDATE) → arithmetic check →
 *   stock update → ledger row → audit row. A failure anywhere rolls back
 *   everything.
 * - No negative stock: stock_after = stock_before + delta is validated in
 *   the transaction AND structurally guaranteed by the DB CHECK
 *   (`inventory_movements` non-negative CHECKs — DATA_DICTIONARY §7).
 * - Zero-delta is refused (the ledger CHECK `quantity_delta <> 0` would
 *   reject it anyway — refusing early gives an honest Arabic error).
 */

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { inventoryMovements, productVariants, products } from '@/db/schema';
import { recordAdminActivity } from '@/lib/auth/activity';

export class InventoryServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'InventoryServiceError';
    this.status = status;
  }
}

/** |delta| is bounded to keep a typo from wiping out a catalog's stock. */
export const ADJUSTMENT_MAX_ABS_DELTA = 10_000;

export const stockAdjustmentSchema = z
  .object({
    variantId: z.string().uuid('معرّف المتغير غير صالح.'),
    /** Signed delta: positive = add stock, negative = remove stock. */
    quantityDelta: z
      .number()
      .int('الكمية يجب أن تكون رقمًا صحيحًا.')
      .refine((v) => v !== 0, 'لا يمكن حفظ تعديل بكمية صفر — عدّل القيمة أو ألغِ.')
      .refine(
        (v) => Math.abs(v) <= ADJUSTMENT_MAX_ABS_DELTA,
        `الحد الأقصى لقيمة التعديل هو ${ADJUSTMENT_MAX_ABS_DELTA} وحدة.`,
      ),
    /** MANDATORY: the admin must state why (ledger + audit). */
    reason: z
      .string()
      .trim()
      .min(3, 'سبب التعديل مطلوب (٣ أحرف على الأقل).')
      .max(300, 'سبب التعديل طويل جدًا (٣٠٠ حرف كحد أقصى).'),
  })
  .strict();

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export type StockAdjustmentResult = {
  variantId: string;
  sku: string;
  productName: string;
  stockBefore: number;
  stockAfter: number;
  quantityDelta: number;
};

export async function adjustVariantStock(
  input: StockAdjustmentInput,
  adminUserId: string,
): Promise<StockAdjustmentResult> {
  if (!/^[0-9a-f-]{36}$/i.test(adminUserId)) {
    throw new InventoryServiceError('معرّف مشرف غير صالح.', 400);
  }

  return db.transaction(async (tx) => {
    const locked = await tx
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        stockQuantity: productVariants.stockQuantity,
        productName: products.name,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(eq(productVariants.id, input.variantId))
      .limit(1)
      .for('update');

    const variant = locked[0];
    if (!variant) {
      throw new InventoryServiceError('المتغير غير موجود.', 404);
    }

    const stockBefore = variant.stockQuantity;
    const stockAfter = stockBefore + input.quantityDelta;
    if (stockAfter < 0) {
      throw new InventoryServiceError(
        `لا يمكن تنفيذ التعديل: سيجعل الكمية سالبة (المتاح ${stockBefore}، التعديل ${input.quantityDelta}).`,
      );
    }

    await tx
      .update(productVariants)
      .set({ stockQuantity: stockAfter, updatedAt: new Date() })
      .where(eq(productVariants.id, variant.id));

    // The ledger row IS the primary audit record: type, signed delta,
    // exact before/after, the admin, and the mandatory reason.
    await tx.insert(inventoryMovements).values({
      variantId: variant.id,
      orderId: null,
      adminUserId,
      movementType: 'manual_adjustment',
      quantityDelta: input.quantityDelta,
      stockBefore,
      stockAfter,
      reason: input.reason,
    });

    // Activity feed row, ATOMIC with the change (sanitized metadata — the
    // reason is business content, not a credential; it belongs in both the
    // ledger row above and this metadata for the dashboard feed).
    await recordAdminActivity(
      {
        adminUserId,
        action: 'inventory.stock.adjusted',
        entityType: 'product_variant',
        entityId: variant.id,
        metadata: {
          sku: variant.sku,
          productName: variant.productName,
          delta: input.quantityDelta,
          stockBefore,
          stockAfter,
          reason: input.reason,
        },
      },
      tx,
    );

    return {
      variantId: variant.id,
      sku: variant.sku,
      productName: variant.productName,
      stockBefore,
      stockAfter,
      quantityDelta: input.quantityDelta,
    };
  });
}
