/**
 * Amira Store — guest cart domain (PHASE-06).
 *
 * Durable CLIENT-side cart per docs/phases/PHASE-06.md + MASTER_PLAN §8:
 * - Cart identity is the VARIANT (`variantId`): two variants of the same
 *   product coexist as separate lines (MASTER_PLAN §8).
 * - The cart stores variant identity, quantity, and client display metadata
 *   only — the server revalidates price/stock at checkout (PHASE-07 order
 *   creation re-reads live variant truth; MASTER_PLAN §7/§10).
 * - Line items are normalized by variant identity: adding the same variant
 *   again merges quantities (task 3).
 * - Quantity is always an integer ≥ 1 — it can never become ≤ 0; removal is
 *   an explicit action (task 2 + verification).
 * - Storage is versioned (`version: 1` in both the key and the payload);
 *   corrupted/foreign payloads are discarded gracefully and valid entries are
 *   salvaged individually (task 8).
 * - `clearCart()` is the only sanctioned wipe. Per task 9 it is the function
 *   the PHASE-07 checkout calls STRICTLY AFTER the server confirms order
 *   creation — never before, never speculatively.
 *
 * This module is PURE and React-free (no framework imports) so the
 * `verify:cart` suite can exercise it directly in Node with an injected
 * storage adapter.
 */

import type { CartEntryDraft } from './metadata';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Hard per-line quantity ceiling (mirrors the PDP purchase panel cap). */
export const MAX_LINE_QUANTITY = 99;

/** Persisted cart line: the PHASE-05 `CartEntryDraft` contract, consumed
 *  unchanged, plus client display metadata only (`addedAt`, `imageUrl`). */
export type CartEntry = CartEntryDraft & {
  /** Client-side ISO timestamp of the first add (display metadata only). */
  addedAt: string;
  /** Client display convenience captured at add time; never server truth. */
  imageUrl: string | null;
};

export type CartDocument = {
  version: 1;
  entries: CartEntry[];
};

/** Minimal storage surface (localStorage in the browser; injectable elsewhere). */
export type CartStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type AddToCartResult = {
  merged: boolean;
  /** True when the requested quantity was capped by the caller-supplied stock. */
  clampedToStock: boolean;
  /** Quantity actually stored for the line after the action. */
  quantity: number;
};

/* -------------------------------------------------------------------------- */
/* Storage key + versioning                                                   */
/* -------------------------------------------------------------------------- */

/** Version lives in the key AND the payload; a future migration changes both. */
export const CART_STORAGE_KEY = 'amira.cart.v1';
export const CART_DOCUMENT_VERSION = 1 as const;

/** Server prices are numeric(12,2) strings; the cart only accepts that shape. */
const NUMERIC_PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

const ISO_STAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/* -------------------------------------------------------------------------- */
/* Storage adapter                                                            */
/* -------------------------------------------------------------------------- */

/** In-memory fallback (SSR, hardened browsers, quota exhaustion): the cart
 *  degrades to session-local memory instead of crashing. */
export function createMemoryStorage(): CartStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/** Browser localStorage when reachable; memory fallback otherwise. */
export function getDefaultStorage(): CartStorage {
  if (typeof window === 'undefined') return createMemoryStorage();
  try {
    const probe = '__amira_cart_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return createMemoryStorage();
  }
}

/* -------------------------------------------------------------------------- */
/* Validation / corruption handling (task 8)                                  */
/* -------------------------------------------------------------------------- */

export type LoadCartResult =
  | { ok: true; document: CartDocument }
  | { ok: false; reason: 'missing' | 'corrupt' | 'version' | 'shape' };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sanitizeQuantity(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const integer = Math.floor(value);
  if (integer < 1) return null;
  return Math.min(integer, MAX_LINE_QUANTITY);
}

function parseCartEntry(raw: unknown): CartEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  const quantity = sanitizeQuantity(candidate.quantity);
  if (
    !isNonEmptyString(candidate.productId) ||
    !isNonEmptyString(candidate.productSlug) ||
    !isNonEmptyString(candidate.productName) ||
    !isNonEmptyString(candidate.variantId) ||
    !isNonEmptyString(candidate.variantSku) ||
    !isNonEmptyString(candidate.variantLabel) ||
    !isNonEmptyString(candidate.unitPrice) ||
    !NUMERIC_PRICE_PATTERN.test(candidate.unitPrice) ||
    quantity === null ||
    !isNonEmptyString(candidate.addedAt) ||
    !ISO_STAMP_PATTERN.test(candidate.addedAt)
  ) {
    return null;
  }
  const imageUrl =
    typeof candidate.imageUrl === 'string' && candidate.imageUrl.trim().length > 0
      ? candidate.imageUrl
      : null;
  return {
    productId: candidate.productId,
    productSlug: candidate.productSlug,
    productName: candidate.productName,
    variantId: candidate.variantId,
    variantSku: candidate.variantSku,
    variantLabel: candidate.variantLabel,
    quantity,
    unitPrice: candidate.unitPrice,
    addedAt: candidate.addedAt,
    imageUrl,
  };
}

/**
 * Parse a persisted cart document. Corruption policy:
 * - not JSON / not an object → `corrupt` (discard);
 * - `version` !== 1 → `version` (unknown/future format: graceful fresh start —
 *   the documented migration point; we never guess a foreign shape);
 * - `entries` not an array → `shape` (discard);
 * - individual invalid entries are dropped, VALID entries are salvaged.
 */
export function parseCartDocument(raw: string | null): LoadCartResult {
  if (raw === null || raw.trim().length === 0) return { ok: false, reason: 'missing' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'corrupt' };
  }

  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== CART_DOCUMENT_VERSION) {
    return { ok: false, reason: 'version' };
  }
  if (!Array.isArray(candidate.entries)) {
    return { ok: false, reason: 'shape' };
  }

  const entries: CartEntry[] = [];
  for (const rawEntry of candidate.entries) {
    const entry = parseCartEntry(rawEntry);
    if (entry !== null) entries.push(entry);
  }
  return { ok: true, document: { version: CART_DOCUMENT_VERSION, entries } };
}

/** Load the cart from storage, normalizing duplicates by variant identity. */
export function loadCartDocument(storage: CartStorage): LoadCartResult {
  return parseCartDocument(storage.getItem(CART_STORAGE_KEY));
}

/** Persist the cart. Returns false when storage refuses (quota/private mode) —
 *  the in-memory cart keeps working; nothing throws. */
export function saveCartDocument(storage: CartStorage, document: CartDocument): boolean {
  try {
    storage.setItem(CART_STORAGE_KEY, JSON.stringify(document));
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Pure actions                                                               */
/* -------------------------------------------------------------------------- */

export function createEmptyCartDocument(): CartDocument {
  return { version: CART_DOCUMENT_VERSION, entries: [] };
}

/**
 * Add a `CartEntryDraft` (the PHASE-05 contract, consumed unchanged) to the
 * cart. Same `variantId` merges quantities (task 3). `options.maxStock` (the
 * caller's live PDP stock) caps the line — the cart never fabricates
 * availability it was not told about (task 6).
 */
export function addCartEntry(
  document: CartDocument,
  draft: CartEntryDraft,
  options: { maxStock?: number; imageUrl?: string | null; now?: string } = {},
): { document: CartDocument; result: AddToCartResult } {
  const requested = Math.max(1, Math.floor(draft.quantity));
  const existing = document.entries.find((entry) => entry.variantId === draft.variantId);

  let quantity: number;
  let merged = false;
  let clampedToStock = false;

  if (existing) {
    merged = true;
    quantity = existing.quantity + requested;
    if (options.maxStock !== undefined) {
      const cap = Math.max(0, Math.floor(options.maxStock));
      if (quantity > cap) {
        quantity = cap;
        clampedToStock = true;
      }
    }
    quantity = Math.min(quantity, MAX_LINE_QUANTITY);
  } else {
    quantity = requested;
    if (options.maxStock !== undefined) {
      const cap = Math.max(0, Math.floor(options.maxStock));
      if (quantity > cap) {
        quantity = cap;
        clampedToStock = true;
      }
    }
    quantity = Math.min(quantity, MAX_LINE_QUANTITY);
  }

  // A zero-stock add cannot produce a line (quantity would be 0 — forbidden).
  if (quantity < 1) {
    return {
      document,
      result: { merged, clampedToStock: true, quantity: existing?.quantity ?? 0 },
    };
  }

  const nextEntries = existing
    ? document.entries.map((entry) =>
        entry.variantId === draft.variantId ? { ...entry, quantity } : entry,
      )
    : [
        ...document.entries,
        {
          productId: draft.productId,
          productSlug: draft.productSlug,
          productName: draft.productName,
          variantId: draft.variantId,
          variantSku: draft.variantSku,
          variantLabel: draft.variantLabel,
          quantity,
          unitPrice: draft.unitPrice,
          addedAt: options.now ?? new Date().toISOString(),
          imageUrl: options.imageUrl ?? null,
        } satisfies CartEntry,
      ];

  return {
    document: { version: CART_DOCUMENT_VERSION, entries: nextEntries },
    result: { merged, clampedToStock, quantity },
  };
}

/**
 * Set a line's quantity. The result is ALWAYS an integer ≥ 1 — quantities can
 * never become ≤ 0 (task 2 + verification); removal is `removeCartEntry`.
 */
export function updateCartEntryQuantity(
  document: CartDocument,
  variantId: string,
  quantity: number,
): { document: CartDocument; applied: boolean; quantity: number } {
  const next = sanitizeQuantity(quantity) ?? 1;
  let applied = false;
  const entries = document.entries.map((entry) => {
    if (entry.variantId !== variantId) return entry;
    applied = true;
    return { ...entry, quantity: next };
  });
  return { document: { version: CART_DOCUMENT_VERSION, entries }, applied, quantity: next };
}

export function removeCartEntry(document: CartDocument, variantId: string): CartDocument {
  return {
    version: CART_DOCUMENT_VERSION,
    entries: document.entries.filter((entry) => entry.variantId !== variantId),
  };
}

/**
 * The ONLY sanctioned full wipe. PHASE-06 task 9 contract: the PHASE-07
 * checkout calls this STRICTLY AFTER the server confirms order creation
 * (MASTER_PLAN §10 — order creation succeeds before any client cleanup).
 */
export function clearCart(_document: CartDocument): CartDocument {
  return createEmptyCartDocument();
}

export function cartHasEntry(document: CartDocument, variantId: string): boolean {
  return document.entries.some((entry) => entry.variantId === variantId);
}

/* -------------------------------------------------------------------------- */
/* Derived display values                                                     */
/* -------------------------------------------------------------------------- */

/** Total units across lines (header badge). */
export function cartCount(document: CartDocument): number {
  return document.entries.reduce((sum, entry) => sum + entry.quantity, 0);
}

/** Exact line subtotal in integer piasters (EGP cents) — no float drift. */
export function cartLineSubtotalCents(entry: CartEntry): number {
  const unitPiasters = Math.round(Number(entry.unitPrice) * 100);
  return unitPiasters * entry.quantity;
}

/**
 * Cart subtotal in integer piasters. Unvalidated / validated-orderable lines
 * (`undefined`, `ok`, `low`) count; known-unavailable lines (`out`,
 * `unavailable`) are excluded and reported separately — an honest subtotal
 * that never silently prices an impossible line.
 *
 * `priceOverrideByVariantId` lets the UI price lines at server-truth current
 * prices (when validation detected a change) instead of the stored display
 * snapshot — the client never invents a price, it only adopts the server's.
 */
export function cartSubtotalCents(
  document: CartDocument,
  statusByVariantId?: ReadonlyMap<string, CartEntryStatus>,
  priceOverrideByVariantId?: ReadonlyMap<string, string>,
): { totalCents: number; excludedLineCount: number } {
  let totalCents = 0;
  let excludedLineCount = 0;
  for (const entry of document.entries) {
    const status = statusByVariantId?.get(entry.variantId);
    if (status === 'out' || status === 'unavailable') {
      excludedLineCount += 1;
      continue;
    }
    const unitPrice = priceOverrideByVariantId?.get(entry.variantId) ?? entry.unitPrice;
    totalCents += Math.round(Number(unitPrice) * 100) * entry.quantity;
  }
  return { totalCents, excludedLineCount };
}

/** Piasters → "349.00" numeric string (server-shaped, display-ready). */
export function centsToPriceString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/* -------------------------------------------------------------------------- */
/* Stock-aware validation states (task 6)                                     */
/* -------------------------------------------------------------------------- */

/** Per-line server-truth status derived from the availability service. */
export type CartEntryStatus = 'ok' | 'low' | 'out' | 'unavailable';

export type CartEntryValidation = {
  status: CartEntryStatus;
  /** Server truth at validation time (numeric string) — may differ from the
   *  stored display price; checkout (PHASE-07) is the binding revalidation. */
  currentPrice: string | null;
  priceChanged: boolean;
  stockQuantity: number | null;
};

export function deriveEntryStatus(input: {
  found: boolean;
  variantActive: boolean;
  productActive: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
}): CartEntryStatus {
  if (!input.found || !input.variantActive || !input.productActive) return 'unavailable';
  if (input.stockQuantity <= 0) return 'out';
  if (input.stockQuantity <= input.lowStockThreshold) return 'low';
  return 'ok';
}
