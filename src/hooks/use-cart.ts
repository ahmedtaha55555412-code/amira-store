'use client';

/**
 * Amira Store — cart React bindings (PHASE-06).
 *
 * `useSyncExternalStore` keeps SSR HTML deterministic (server snapshot = empty
 * cart) and re-renders after client hydration without a mismatch warning.
 */

import { useSyncExternalStore } from 'react';

import { cartStore, selectCartCount, selectSubtotalCents, type CartState } from '@/lib/storefront/cart-store';

export function useCartState(): CartState {
  return useSyncExternalStore(
    cartStore.subscribe,
    cartStore.getSnapshot,
    cartStore.getServerSnapshot,
  );
}

export function useCartCount(): number {
  return useSyncExternalStore(
    cartStore.subscribe,
    () => selectCartCount(cartStore.getSnapshot()),
    () => 0,
  );
}

export function useCartSubtotal(): { totalCents: number; excludedLineCount: number } {
  return useSyncExternalStore(
    cartStore.subscribe,
    () => selectSubtotalCents(cartStore.getSnapshot()),
    () => ({ totalCents: 0, excludedLineCount: 0 }),
  );
}

export { cartStore };
