/**
 * Amira Store — order-success handoff (PHASE-07).
 *
 * Guest model (no accounts): immediately after the server CONFIRMS order
 * creation, the checkout view stores the customer-facing payload in
 * sessionStorage under a versioned key and routes to /order/success. The
 * success page reads it back — refresh-safe within the tab, automatically
 * gone when the tab closes, and NEVER a server enumeration surface (the
 * success page has no order-existence oracle: no payload → honest empty
 * state, no lookup endpoint exists).
 *
 * The cart is cleared ONLY after the server confirms (cartStore.clear() is
 * called in the same success path — the PHASE-06 task-9 contract).
 */

import { z } from 'zod';

/** Versioned storage key (a future payload change bumps the version). */
export const ORDER_SUCCESS_STORAGE_KEY = 'amira.order.success.v1';

export const orderSuccessPayloadSchema = z.object({
  orderNumber: z.string().min(4).max(32),
  items: z
    .array(
      z.object({
        productName: z.string().min(1),
        attributesLabel: z.string(),
        quantity: z.number().int().min(1),
        unitPrice: z.string(),
        subtotal: z.string(),
      }),
    )
    .min(1)
    .max(50),
  productsTotal: z.string(),
  paymentMethod: z.string().min(1),
  whatsappMessage: z.string().min(1),
  whatsappUrl: z.string().url(),
});

export type OrderSuccessPayload = z.infer<typeof orderSuccessPayloadSchema>;

/* -------------------------------------------------------------------------- */
/* Tiny snapshot store (useSyncExternalStore-compatible)                       */
/* -------------------------------------------------------------------------- */

/**
 * sessionStorage is unavailable during SSR and reading it in an effect would
 * require setState-in-effect (React-compiler lint). A cached external store
 * is the sanctioned hydration-safe pattern — the same mechanism the cart
 * store uses: the server snapshot is null, the client snapshot is the cached
 * read, and saving a new payload invalidates + notifies.
 */
let cachedPayload: OrderSuccessPayload | null | undefined;
const listeners = new Set<() => void>();

export function subscribeOrderSuccess(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Cached client snapshot (stable reference between changes). */
export function getOrderSuccessSnapshot(): OrderSuccessPayload | null {
  if (cachedPayload === undefined) cachedPayload = loadSuccessPayload();
  return cachedPayload;
}

/** Server snapshot — always null so SSR HTML is deterministic. */
export function getServerOrderSuccessSnapshot(): OrderSuccessPayload | null {
  return null;
}

/** Persist the payload (best effort — a storage failure must not block the
 *  success route; the page degrades to its honest empty state instead). */
export function saveSuccessPayload(payload: OrderSuccessPayload): void {
  cachedPayload = payload;
  for (const listener of listeners) listener();
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ORDER_SUCCESS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota/private mode — success page shows its fallback; order stays valid.
  }
}

/** Read + validate the payload; anything foreign/stale is discarded. */
export function loadSuccessPayload(): OrderSuccessPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ORDER_SUCCESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = orderSuccessPayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
