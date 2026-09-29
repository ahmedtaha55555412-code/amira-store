/**
 * Amira Store — admin dashboard service (PHASE-12).
 *
 * MASTER_PLAN PHASE-12 "Dashboard sections: summary metrics, order queues,
 * low stock, recent operational activity". Every number on the admin home
 * page comes from a REAL database query in THIS file — metrics are never
 * fabricated, defaulted, or guessed (PHASE-12 scope: "Metrics must come from
 * real database truth").
 *
 * Read-only: the dashboard service performs ZERO mutations. Revenue is
 * reported honestly as the products+shipping total of orders that are not
 * canceled — COD collection state is tracked separately (payment_status) and
 * surfaced as its own metric rather than being conflated with "revenue".
 */

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  adminActivityLogs,
  adminUsers,
  mediaAssets,
  orders,
  productVariants,
  products,
  reviews,
  whatsappTestimonials,
} from '@/db/schema';

export type DashboardMetrics = {
  /** Orders awaiting first action (status = new). */
  newOrders: number;
  /** Orders opened but not yet confirmed (status = under_review). */
  underReviewOrders: number;
  /** Orders in the active pipeline (not completed, not canceled). */
  activeOrders: number;
  /** Completed orders (fulfilled lifetime). */
  completedOrders: number;
  /** Canceled orders lifetime. */
  canceledOrders: number;
  /** COD payment still pending on non-canceled orders. */
  codPendingOrders: number;
  /**
   * Sum of grand_total over orders that are NOT canceled (EGP numeric string).
   * Honest label in the UI: «إجمالي الطلبات (غير شاملة الملغي)».
   */
  grandTotalNonCanceled: string;
  /** Products per status. */
  activeProducts: number;
  draftProducts: number;
  archivedProducts: number;
  /** Sellable variants (active product rows not filtered; inactive variants excluded). */
  activeVariants: number;
  /** stock > 0 AND stock <= low_stock_threshold. */
  lowStockVariants: number;
  /** stock = 0. */
  outOfStockVariants: number;
  /** Reviews awaiting moderation. */
  pendingReviews: number;
  /** WhatsApp testimonials still draft (uploaded, unpublished). */
  draftTestimonials: number;
  /** Media assets registered. */
  mediaAssets: number;
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [orderRow] = await db
    .select({
      newOrders: sql<number>`count(*) filter (where ${orders.orderStatus} = 'new')::int`,
      underReviewOrders: sql<number>`count(*) filter (where ${orders.orderStatus} = 'under_review')::int`,
      activeOrders: sql<number>`count(*) filter (where ${orders.orderStatus} not in ('completed','canceled'))::int`,
      completedOrders: sql<number>`count(*) filter (where ${orders.orderStatus} = 'completed')::int`,
      canceledOrders: sql<number>`count(*) filter (where ${orders.orderStatus} = 'canceled')::int`,
      codPendingOrders: sql<number>`count(*) filter (where ${orders.orderStatus} <> 'canceled' and ${orders.paymentStatus} = 'pending')::int`,
      grandTotalNonCanceled: sql<string>`coalesce(sum(${orders.grandTotal}) filter (where ${orders.orderStatus} <> 'canceled'), 0)::text`,
    })
    .from(orders);

  const [productRow] = await db
    .select({
      activeProducts: sql<number>`count(*) filter (where ${products.status} = 'active')::int`,
      draftProducts: sql<number>`count(*) filter (where ${products.status} = 'draft')::int`,
      archivedProducts: sql<number>`count(*) filter (where ${products.status} = 'archived')::int`,
    })
    .from(products);

  const [variantRow] = await db
    .select({
      activeVariants: sql<number>`count(*) filter (where ${productVariants.isActive})::int`,
      lowStockVariants: sql<number>`count(*) filter (where ${productVariants.isActive} and ${productVariants.stockQuantity} > 0 and ${productVariants.stockQuantity} <= ${productVariants.lowStockThreshold})::int`,
      outOfStockVariants: sql<number>`count(*) filter (where ${productVariants.isActive} and ${productVariants.stockQuantity} = 0)::int`,
    })
    .from(productVariants);

  const [reviewRow] = await db
    .select({
      pendingReviews: sql<number>`count(*) filter (where ${reviews.status} = 'pending')::int`,
    })
    .from(reviews);

  const [testimonialRow] = await db
    .select({
      draftTestimonials: sql<number>`count(*) filter (where ${whatsappTestimonials.status} = 'draft')::int`,
    })
    .from(whatsappTestimonials);

  const [mediaRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mediaAssets);

  return {
    newOrders: orderRow?.newOrders ?? 0,
    underReviewOrders: orderRow?.underReviewOrders ?? 0,
    activeOrders: orderRow?.activeOrders ?? 0,
    completedOrders: orderRow?.completedOrders ?? 0,
    canceledOrders: orderRow?.canceledOrders ?? 0,
    codPendingOrders: orderRow?.codPendingOrders ?? 0,
    grandTotalNonCanceled: orderRow?.grandTotalNonCanceled ?? '0',
    activeProducts: productRow?.activeProducts ?? 0,
    draftProducts: productRow?.draftProducts ?? 0,
    archivedProducts: productRow?.archivedProducts ?? 0,
    activeVariants: variantRow?.activeVariants ?? 0,
    lowStockVariants: variantRow?.lowStockVariants ?? 0,
    outOfStockVariants: variantRow?.outOfStockVariants ?? 0,
    pendingReviews: reviewRow?.pendingReviews ?? 0,
    draftTestimonials: testimonialRow?.draftTestimonials ?? 0,
    mediaAssets: mediaRow?.n ?? 0,
  };
}

export type DashboardOrderRow = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  orderStatus: string;
  grandTotal: string;
  itemCount: number;
  createdAt: Date;
};

/** Order queues: the actionable heads of the pipeline (new + under review). */
export async function listDashboardOrderQueues(limit = 6): Promise<{
  newOrders: DashboardOrderRow[];
  underReview: DashboardOrderRow[];
}> {
  const base = {
    id: orders.id,
    orderNumber: orders.orderNumber,
    customerName: orders.customerNameSnapshot,
    customerPhone: orders.customerPhoneSnapshot,
    orderStatus: orders.orderStatus,
    grandTotal: orders.grandTotal,
    itemCount: sql<number>`(select count(*) from "order_items" "oi" where "oi"."order_id" = "orders"."id")::int`,
    createdAt: orders.createdAt,
  };

  const [newRows, reviewRows] = await Promise.all([
    db
      .select(base)
      .from(orders)
      .where(eq(orders.orderStatus, 'new'))
      .orderBy(desc(orders.createdAt))
      .limit(limit),
    db
      .select(base)
      .from(orders)
      .where(eq(orders.orderStatus, 'under_review'))
      .orderBy(desc(orders.createdAt))
      .limit(limit),
  ]);

  return { newOrders: newRows, underReview: reviewRows };
}

export type DashboardLowStockRow = {
  variantId: string;
  sku: string;
  productName: string;
  stockQuantity: number;
  lowStockThreshold: number;
};

/** Lowest-stock active variants first — the same rule as the inventory «low» view. */
export async function listDashboardLowStock(limit = 6): Promise<DashboardLowStockRow[]> {
  return db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productName: products.name,
      stockQuantity: productVariants.stockQuantity,
      lowStockThreshold: productVariants.lowStockThreshold,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        eq(productVariants.isActive, true),
        eq(products.status, 'active'),
        sql`${productVariants.stockQuantity} <= ${productVariants.lowStockThreshold}`,
      ),
    )
    .orderBy(productVariants.stockQuantity, products.name)
    .limit(limit);
}

export type DashboardActivityRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  adminUsername: string | null;
  createdAt: Date;
};

/** Recent operational activity: the sanitized audit trail (newest first). */
export async function listDashboardActivity(limit = 8): Promise<DashboardActivityRow[]> {
  const rows = await db
    .select({
      id: adminActivityLogs.id,
      action: adminActivityLogs.action,
      entityType: adminActivityLogs.entityType,
      entityId: adminActivityLogs.entityId,
      metadata: adminActivityLogs.metadata,
      adminUsername: adminUsers.username,
      createdAt: adminActivityLogs.createdAt,
    })
    .from(adminActivityLogs)
    .leftJoin(adminUsers, eq(adminActivityLogs.adminUserId, adminUsers.id))
    .orderBy(desc(adminActivityLogs.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
  }));
}

/**
 * The dashboard reads exclusively; nothing here may drift into mutations.
 * (Guard against future drift: every exported function above is a SELECT.)
 */
export type DashboardData = {
  metrics: DashboardMetrics;
  queues: { newOrders: DashboardOrderRow[]; underReview: DashboardOrderRow[] };
  lowStock: DashboardLowStockRow[];
  activity: DashboardActivityRow[];
};

/** One-call aggregation for the page (parallel queries, single round-trip wave). */
export async function getDashboardData(): Promise<DashboardData> {
  const [metrics, queues, lowStock, activity] = await Promise.all([
    getDashboardMetrics(),
    listDashboardOrderQueues(),
    listDashboardLowStock(),
    listDashboardActivity(),
  ]);
  return {
    metrics,
    queues,
    lowStock,
    activity,
  };
}
