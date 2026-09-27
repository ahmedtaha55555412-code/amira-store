/**
 * Amira Store — reactive cart store (PHASE-06).
 *
 * A tiny framework-free external store over the pure cart domain:
 * - hydrates ONCE from durable storage on the client (SSR snapshot is an empty
 *   cart, so `useSyncExternalStore` renders matching HTML and switches after
 *   hydration without a mismatch);
 * - persists after every mutation (task 1 — survives refresh);
 * - owns the stock-aware validation cache (task 6) with a freshness window;
 * - listens to `storage` events so two tabs stay consistent.
 *
 * Consumed by `src/hooks/use-cart.ts` via `useSyncExternalStore`.
 */

import {
  addCartEntry,
  cartCount,
  cartSubtotalCents,
  clearCart,
  createEmptyCartDocument,
  deriveEntryStatus,
  getDefaultStorage,
  loadCartDocument,
  removeCartEntry,
  saveCartDocument,
  updateCartEntryQuantity,
  type CartDocument,
  type CartEntry,
  type CartEntryStatus,
  type CartEntryValidation,
  type CartStorage,
  type AddToCartResult,
} from './cart';
import type { CartEntryDraft } from './metadata';

/** How long a validation result is trusted before the UI may revalidate. */
export const CART_VALIDATION_FRESH_MS = 60_000;

/** Server payload shape for the availability endpoint (client side mirror). */
export type AvailabilityResponse = {
  availability: Array<{
    variantId: string;
    found: boolean;
    variantActive: boolean;
    productActive: boolean;
    stockQuantity: number;
    lowStockThreshold: number;
    currentPrice: string;
  }>;
};

export type CartState = {
  /** True after the first client hydration from durable storage. */
  hydrated: boolean;
  entries: CartEntry[];
  /** variantId → latest server-truth validation (task 6). */
  validation: Record<string, CartEntryValidation | undefined>;
  validating: boolean;
  lastValidatedAt: string | null;
};

const EMPTY_STATE: CartState = {
  hydrated: false,
  entries: [],
  validation: {},
  validating: false,
  lastValidatedAt: null,
};

function snapshotOf(document: CartDocument, base: CartState): CartState {
  return { ...base, entries: document.entries };
}

class CartStore {
  private storage: CartStorage;
  private state: CartState = EMPTY_STATE;
  private listeners = new Set<() => void>();
  private document: CartDocument = createEmptyCartDocument();
  private validationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(storage?: CartStorage) {
    this.storage = storage ?? getDefaultStorage();
    if (typeof window !== 'undefined') {
      // Hydrate immediately on the client; the SSR snapshot stays empty and
      // useSyncExternalStore reconciles after hydration.
      this.hydrate();
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('storage', (event) => {
          if (event.key === null || event.key === 'amira.cart.v1') this.hydrate();
        });
      }
    }
  }

  /* ------------------------------ subscription ----------------------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CartState => this.state;

  /** Server snapshot — stable empty cart so SSR HTML is deterministic. */
  getServerSnapshot = (): CartState => EMPTY_STATE;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private commit(document: CartDocument): void {
    this.document = document;
    saveCartDocument(this.storage, document);
    this.state = snapshotOf(document, this.state);
    this.emit();
  }

  /* -------------------------------- hydration ------------------------------ */

  /** Re-read durable storage (first client render, cross-tab `storage` events). */
  hydrate(): void {
    const result = loadCartDocument(this.storage);
    if (result.ok) {
      this.document = result.document;
    } else {
      // missing/corrupt/version/shape → graceful fresh cart (task 8). For
      // everything except `missing` we also overwrite the bad payload.
      this.document = createEmptyCartDocument();
      if (result.reason !== 'missing') saveCartDocument(this.storage, this.document);
    }
    this.state = { ...snapshotOf(this.document, this.state), hydrated: true };
    this.emit();
  }

  /* --------------------------------- actions ------------------------------- */

  add(
    draft: CartEntryDraft,
    options: { maxStock?: number; imageUrl?: string | null } = {},
  ): AddToCartResult {
    const { document, result } = addCartEntry(this.document, draft, options);
    // A refused zero-quantity add (zero stock) returns the unchanged document —
    // committing it is a harmless no-op that still persists/validates state.
    this.commit(document);
    return result;
  }

  updateQuantity(variantId: string, quantity: number): void {
    const { document } = updateCartEntryQuantity(this.document, variantId, quantity);
    this.commit(document);
  }

  remove(variantId: string): void {
    this.commit(removeCartEntry(this.document, variantId));
  }

  /** Task 9 contract: called by PHASE-07 checkout ONLY after the server
   *  confirms order creation. Also the manual "clear cart" action. */
  clear(): void {
    this.commit(clearCart(this.document));
    this.state = { ...this.state, validation: {}, lastValidatedAt: null };
    this.emit();
  }

  /* ------------------------- stock-aware validation ------------------------ */

  private markValidating(validating: boolean): void {
    if (this.state.validating === validating) return;
    this.state = { ...this.state, validating };
    this.emit();
  }

  applyAvailability(payload: AvailabilityResponse): void {
    const validation: Record<string, CartEntryValidation | undefined> = {
      ...this.state.validation,
    };
    for (const item of payload.availability) {
      const entry = this.document.entries.find((e) => e.variantId === item.variantId);
      const status = deriveEntryStatus(item);
      validation[item.variantId] = {
        status,
        currentPrice: item.found ? item.currentPrice : null,
        priceChanged: entry ? item.currentPrice !== entry.unitPrice : false,
        stockQuantity: item.found ? item.stockQuantity : null,
      };
    }
    this.state = {
      ...this.state,
      validation,
      validating: false,
      lastValidatedAt: new Date().toISOString(),
    };
    this.emit();
  }

  /** POST the live variant ids to the read-only availability endpoint. */
  async revalidate(): Promise<void> {
    const variantIds = this.document.entries.map((entry) => entry.variantId);
    if (variantIds.length === 0) {
      this.state = { ...this.state, validation: {}, validating: false };
      this.emit();
      return;
    }
    if (typeof fetch !== 'function') return; // Node/test environments
    this.markValidating(true);
    try {
      const response = await fetch('/api/storefront/cart-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantIds }),
      });
      if (!response.ok) return; // stale cache stays; honest fallback, no crash
      const payload = (await response.json()) as AvailabilityResponse;
      this.applyAvailability(payload);
    } catch {
      // Network failure: keep the last known validation; never block browsing.
    } finally {
      if (this.state.validating) this.markValidating(false);
    }
  }

  /** Revalidate when the cache is missing or older than the freshness window. */
  scheduleRevalidation(): void {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    if (this.validationTimer !== null) return; // one in-flight round max
    const last = this.state.lastValidatedAt ? Date.parse(this.state.lastValidatedAt) : 0;
    const isFresh = Date.now() - last < CART_VALIDATION_FRESH_MS;
    if (isFresh && this.state.lastValidatedAt !== null) return;
    this.validationTimer = setTimeout(() => {
      this.validationTimer = null;
      void this.revalidate();
    }, 0);
  }
}

/** App-wide singleton (module scope → one store per page). */
export const cartStore = new CartStore();


/* ------------------------------- selectors -------------------------------- */

export function selectCartCount(state: CartState): number {
  return cartCount({ version: 1, entries: state.entries });
}

export function selectSubtotalCents(state: CartState): {
  totalCents: number;
  excludedLineCount: number;
} {
  const statusByVariantId = new Map<string, CartEntryStatus>();
  for (const [variantId, validation] of Object.entries(state.validation)) {
    if (validation) statusByVariantId.set(variantId, validation.status);
  }
  return cartSubtotalCents({ version: 1, entries: state.entries }, statusByVariantId);
}
