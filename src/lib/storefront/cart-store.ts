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
 * DERIVED VALUES (count/subtotal) are computed INTO the state object on every
 * transition — `getSnapshot` must return a STABLE reference between changes
 * (useSyncExternalStore contract); selectors never allocate.
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
  /** Derived with the state (stable between transitions — never per-call). */
  count: number;
  subtotalCents: number;
  excludedLineCount: number;
};

const EMPTY_STATE: CartState = {
  hydrated: false,
  entries: [],
  validation: {},
  validating: false,
  lastValidatedAt: null,
  count: 0,
  subtotalCents: 0,
  excludedLineCount: 0,
};

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

  /** Single state-transition path: merges a partial and recomputes derived
   *  values from (document.entries, validation) so getSnapshot stays stable. */
  private updateState(partial: Partial<CartState>): void {
    const merged = { ...this.state, ...partial };
    const statusByVariantId = new Map<string, CartEntryStatus>();
    const priceOverrideByVariantId = new Map<string, string>();
    for (const [variantId, validation] of Object.entries(merged.validation)) {
      if (!validation) continue;
      statusByVariantId.set(variantId, validation.status);
      if (validation.priceChanged && validation.currentPrice) {
        priceOverrideByVariantId.set(variantId, validation.currentPrice);
      }
    }
    const subtotal = cartSubtotalCents(this.document, statusByVariantId, priceOverrideByVariantId);
    this.state = {
      ...merged,
      count: cartCount(this.document),
      subtotalCents: subtotal.totalCents,
      excludedLineCount: subtotal.excludedLineCount,
    };
    this.emit();
  }

  private commit(document: CartDocument): void {
    this.document = document;
    saveCartDocument(this.storage, document);
    this.updateState({ entries: document.entries });
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
    this.updateState({ hydrated: true, entries: this.document.entries });
  }

  /* --------------------------------- actions ------------------------------- */

  add(
    draft: CartEntryDraft,
    options: { maxStock?: number; imageUrl?: string | null; now?: string } = {},
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
    this.updateState({ validation: {}, lastValidatedAt: null });
  }

  /* ------------------------- stock-aware validation ------------------------ */

  private markValidating(validating: boolean): void {
    if (this.state.validating === validating) return;
    this.updateState({ validating });
  }

  applyAvailability(payload: AvailabilityResponse): void {
    const validation: Record<string, CartEntryValidation | undefined> = {
      ...this.state.validation,
    };
    for (const item of payload.availability) {
      const entry = this.document.entries.find((e) => e.variantId === item.variantId);
      validation[item.variantId] = {
        status: deriveEntryStatus(item),
        currentPrice: item.found ? item.currentPrice : null,
        priceChanged: entry ? item.currentPrice !== entry.unitPrice : false,
        stockQuantity: item.found ? item.stockQuantity : null,
      };
    }
    this.updateState({
      validation,
      validating: false,
      lastValidatedAt: new Date().toISOString(),
    });
  }

  /** POST the live variant ids to the read-only availability endpoint. */
  async revalidate(): Promise<void> {
    const variantIds = this.document.entries.map((entry) => entry.variantId);
    if (variantIds.length === 0) {
      this.updateState({ validation: {}, validating: false });
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
    if (last > 0 && Date.now() - last < CART_VALIDATION_FRESH_MS) return;
    this.validationTimer = setTimeout(() => {
      this.validationTimer = null;
      void this.revalidate();
    }, 0);
  }
}

/** App-wide singleton (module scope → one store per page). */
export const cartStore = new CartStore();
