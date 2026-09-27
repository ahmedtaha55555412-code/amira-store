export type ListingParams = {
  attr: string[];
  stock: boolean;
  sale: boolean;
  pmin?: string;
  pmax?: string;
  sort?: string;
  page?: number;
};

/**
 * Canonical URL builders for the server-rendered listings (PHASE-05 tasks 9–10).
 * Pure string functions — importable from BOTH server pages and client
 * components, so filter/sort state lives entirely in the URL (shareable,
 * no functions across the server→client boundary).
 */
export function buildCategoryHref(slug: string, params: ListingParams): string {
  const search = new URLSearchParams();
  for (const valueId of params.attr) search.append("attr", valueId);
  if (params.stock) search.set("stock", "1");
  if (params.sale) search.set("sale", "1");
  if (params.pmin) search.set("pmin", params.pmin);
  if (params.pmax) search.set("pmax", params.pmax);
  if (params.sort && params.sort !== "newest") search.set("sort", params.sort);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const queryString = search.toString();
  return `/category/${encodeURIComponent(slug)}${queryString ? `?${queryString}` : ""}`;
}

export function buildSearchHref(params: { q?: string; sort?: string; page?: number }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.sort && params.sort !== "newest") search.set("sort", params.sort);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const queryString = search.toString();
  return `/search${queryString ? `?${queryString}` : ""}`;
}
