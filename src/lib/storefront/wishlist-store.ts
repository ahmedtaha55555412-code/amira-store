/**
 * Amira Store — reactive wishlist store (PHASE-06).
 *
 * Same discipline as the cart store: hydrate once on the client, SSR snapshot
 * stays empty (no hydration mismatch), persist after every toggle, keep tabs
 * consistent via `storage` events. The wishlist never talks to the server —
 * it is guest state, local to the browser (MASTER_PLAN §8).
 */

import {
  getDefaultWishlistStorage,
  loadWishlistDocument,
  removeWishlistItem,
  saveWishlistDocument,
  toggleWishlistItem,
  wishlistHasItem,
  createEmptyWishlistDocument,
  WISHLIST_STORAGE_KEY,
  type WishlistDocument,
  type WishlistItem,
  type WishlistStorage,
} from './wishlist';

export type WishlistState = {
  /** True after the first client hydration from durable storage. */
  hydrated: boolean;
  items: WishlistItem[];
  /** Durable localStorage write status; false means the browser rejected persistence. */
  persistenceStatus: 'ok' | 'failed';
};

const EMPTY_STATE: WishlistState = { hydrated: false, items: [], persistenceStatus: 'ok' };

class WishlistStore {
  private storage: WishlistStorage;
  private state: WishlistState = EMPTY_STATE;
  private listeners = new Set<() => void>();
  private document: WishlistDocument = createEmptyWishlistDocument();

  constructor(storage?: WishlistStorage) {
    this.storage = storage ?? getDefaultWishlistStorage();
    if (typeof window !== 'undefined') {
      this.hydrate();
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('storage', (event) => {
          if (event.key === null || event.key === WISHLIST_STORAGE_KEY) this.hydrate();
        });
      }
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): WishlistState => this.state;

  getServerSnapshot = (): WishlistState => EMPTY_STATE;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private commit(document: WishlistDocument): void {
    this.document = document;
    const persisted = saveWishlistDocument(this.storage, document);
    this.state = { hydrated: true, items: document.items, persistenceStatus: persisted ? 'ok' : 'failed' };
    this.emit();
  }

  hydrate(): void {
    const result = loadWishlistDocument(this.storage);
    if (result.ok) {
      this.document = result.document;
    } else {
      this.document = createEmptyWishlistDocument();
      if (result.reason !== 'missing') {
        const repaired = saveWishlistDocument(this.storage, this.document);
        this.state = { hydrated: true, items: this.document.items, persistenceStatus: repaired ? 'ok' : 'failed' };
        this.emit();
        return;
      }
    }
    this.state = { hydrated: true, items: this.document.items, persistenceStatus: 'ok' };
    this.emit();
  }

  toggle(item: Omit<WishlistItem, 'addedAt'>): boolean {
    const { added, document } = toggleWishlistItem(this.document, item);
    this.commit(document);
    return added;
  }

  remove(productId: string): void {
    this.commit(removeWishlistItem(this.document, productId));
  }

  has(productId: string): boolean {
    return wishlistHasItem(this.document, productId);
  }
}

/** App-wide singleton (module scope → one store per page). */
export const wishlistStore = new WishlistStore();

