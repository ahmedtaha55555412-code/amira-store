'use client';

/**
 * Amira Store — wishlist React bindings (PHASE-06).
 *
 * SSR snapshot = empty wishlist; the client snapshot switches in right after
 * hydration (no mismatch), so hearts reflect persisted state on every surface.
 */

import { useSyncExternalStore } from 'react';

import { wishlistStore, type WishlistState } from '@/lib/storefront/wishlist-store';

export function useWishlistState(): WishlistState {
  return useSyncExternalStore(
    wishlistStore.subscribe,
    wishlistStore.getSnapshot,
    wishlistStore.getServerSnapshot,
  );
}

export function useWishlistHas(productId: string): boolean {
  return useSyncExternalStore(
    wishlistStore.subscribe,
    () => wishlistStore.has(productId),
    () => false,
  );
}

export { wishlistStore };
