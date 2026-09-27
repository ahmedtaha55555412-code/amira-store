/**
 * Amira Store — guest wishlist domain (PHASE-06 task 7).
 *
 * Wishlist is guest-only and local to the browser (MASTER_PLAN §2/§8): no
 * customer account, no customer endpoints, no server state. Same durability
 * discipline as the cart: versioned payload, corrupted/foreign documents are
 * discarded gracefully, valid items are salvaged individually, storage
 * failures degrade to memory without throwing.
 *
 * Pure and React-free so the `verify:cart` suite exercises it directly in Node.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type WishlistItem = {
  productId: string;
  productSlug: string;
  productName: string;
  imageUrl: string | null;
  addedAt: string;
};

export type WishlistDocument = {
  version: 1;
  items: WishlistItem[];
};

export type WishlistStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/* -------------------------------------------------------------------------- */
/* Storage key + versioning                                                   */
/* -------------------------------------------------------------------------- */

export const WISHLIST_STORAGE_KEY = 'amira.wishlist.v1';
export const WISHLIST_DOCUMENT_VERSION = 1 as const;

const ISO_STAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/* -------------------------------------------------------------------------- */
/* Storage adapter                                                            */
/* -------------------------------------------------------------------------- */

export function createWishlistMemoryStorage(): WishlistStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

export function getDefaultWishlistStorage(): WishlistStorage {
  if (typeof window === 'undefined') return createWishlistMemoryStorage();
  try {
    const probe = '__amira_wishlist_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return createWishlistMemoryStorage();
  }
}

/* -------------------------------------------------------------------------- */
/* Validation / corruption handling (task 8)                                  */
/* -------------------------------------------------------------------------- */

export type LoadWishlistResult =
  | { ok: true; document: WishlistDocument }
  | { ok: false; reason: 'missing' | 'corrupt' | 'version' | 'shape' };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseWishlistItem(raw: unknown): WishlistItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.productId) ||
    !isNonEmptyString(candidate.productSlug) ||
    !isNonEmptyString(candidate.productName) ||
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
    imageUrl,
    addedAt: candidate.addedAt,
  };
}

export function parseWishlistDocument(raw: string | null): LoadWishlistResult {
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
  if (candidate.version !== WISHLIST_DOCUMENT_VERSION) {
    return { ok: false, reason: 'version' };
  }
  if (!Array.isArray(candidate.items)) {
    return { ok: false, reason: 'shape' };
  }

  const items: WishlistItem[] = [];
  const seen = new Set<string>();
  for (const rawItem of candidate.items) {
    const item = parseWishlistItem(rawItem);
    // Identity is the product: duplicates in a hand-edited payload collapse.
    if (item !== null && !seen.has(item.productId)) {
      seen.add(item.productId);
      items.push(item);
    }
  }
  return { ok: true, document: { version: WISHLIST_DOCUMENT_VERSION, items } };
}

export function loadWishlistDocument(storage: WishlistStorage): LoadWishlistResult {
  return parseWishlistDocument(storage.getItem(WISHLIST_STORAGE_KEY));
}

export function saveWishlistDocument(
  storage: WishlistStorage,
  document: WishlistDocument,
): boolean {
  try {
    storage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(document));
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Pure actions                                                               */
/* -------------------------------------------------------------------------- */

export function createEmptyWishlistDocument(): WishlistDocument {
  return { version: WISHLIST_DOCUMENT_VERSION, items: [] };
}

export type WishlistToggleResult = { added: boolean; document: WishlistDocument };

/** Toggle by product identity — the whole wishlist API a guest needs. */
export function toggleWishlistItem(
  document: WishlistDocument,
  item: Omit<WishlistItem, 'addedAt'>,
  options: { now?: string } = {},
): WishlistToggleResult {
  const exists = document.items.some((existing) => existing.productId === item.productId);
  if (exists) {
    return {
      added: false,
      document: {
        version: WISHLIST_DOCUMENT_VERSION,
        items: document.items.filter((existing) => existing.productId !== item.productId),
      },
    };
  }
  return {
    added: true,
    document: {
      version: WISHLIST_DOCUMENT_VERSION,
      items: [
        ...document.items,
        { ...item, addedAt: options.now ?? new Date().toISOString() },
      ],
    },
  };
}

export function wishlistHasItem(document: WishlistDocument, productId: string): boolean {
  return document.items.some((item) => item.productId === productId);
}

export function removeWishlistItem(document: WishlistDocument, productId: string): WishlistDocument {
  return {
    version: WISHLIST_DOCUMENT_VERSION,
    items: document.items.filter((item) => item.productId !== productId),
  };
}
