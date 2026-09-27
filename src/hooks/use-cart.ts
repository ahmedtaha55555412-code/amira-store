'use client';

/**
 * Amira Store — cart React bindings (PHASE-06).
 *
 * `useSyncExternalStore` keeps SSR HTML deterministic (server snapshot = empty
 * cart) and re-renders after client hydration without a mismatch warning.
 * The store's snapshot is a STABLE reference between transitions (derived
 * values are computed into it); the only allocating hook (subtotal object) is
 * memoized per value.
 */

import { useMemo, useSyncExternalStore } from 'react';

import { cartStore, type CartState } from '@/lib/storefront/cart-store';

export function useCartState(): CartState {
  return useSyncExternalStore(
    cartStore.subscribe,
    cartStore.getSnapshot,
    cartStore.getServerSnapshot,
  );
}

/** Total units (primitive — allocation-free, stable per state). */
export function useCartCount(): number {
  return useSyncExternalStore(
    cartStore.subscribe,
    () => cartStore.getSnapshot().count,
    () => 0,
  );
}

export function useCartSubtotal(): { totalCents: number; excludedLineCount: number } {
  const subtotalCents = useSyncExternalStore(
    cartStore.subscribe,
    () => cartStore.getSnapshot().subtotalCents,
    () => 0,
  );
  const excludedLineCount = useSyncExternalStore(
    cartStore.subscribe,
    () => cartStore.getSnapshot().excludedLineCount,
    () => 0,
  );
  return useMemo(
    () => ({ totalCents: subtotalCents, excludedLineCount }),
    [subtotalCents, excludedLineCount],
  );
}

export { cartStore };
