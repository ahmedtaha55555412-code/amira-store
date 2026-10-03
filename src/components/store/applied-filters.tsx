import Link from "next/link";
import { X } from "lucide-react";

import type { StorefrontFacets } from "@/lib/storefront/catalog";
import { buildCategoryHref } from "@/lib/storefront/urls";
import type { CategoryFilterParams } from "./category-filters";

/**
 * Applied-filters overview (PACK-08 / UX-09) — the Baymard-recommended
 * removable chip row rendered above category listings.
 *
 * Contract:
 * - The URL is the ONLY state source: every chip is a plain link built with
 *   the existing `buildCategoryHref` builder (removal = navigation to the
 *   same listing minus that one filter, pagination reset to page 1 — the
 *   exact semantics of the existing filter `apply()`).
 * - One chip per logical filter: each attribute value, availability, sale,
 *   and the price range (min+max form ONE filter and are removed together;
 *   a one-sided range removes only its own bound).
 * - No new backend/database state, no new filter types, no count/sort
 *   changes, no client JS (server-rendered, fully keyboard accessible).
 * - "Clear all" stays available (it also remains inside the filter panel).
 * - Renders nothing when no filter is active (honest "no filters" state).
 */

type AppliedFiltersProps = {
  slug: string;
  current: CategoryFilterParams;
  facets: StorefrontFacets;
};

type AppliedChip = {
  key: string;
  label: string;
  /** COMPLETE filter state after removing this one filter (sort added at build). */
  next: Omit<CategoryFilterParams, "sort">;
};

const latnNumber = (value: string) =>
  Number(value).toLocaleString("ar-EG-u-nu-latn");

export function AppliedFilters({ slug, current, facets }: AppliedFiltersProps) {
  if (
    current.attr.length === 0 &&
    !current.stock &&
    !current.sale &&
    current.pmin === undefined &&
    current.pmax === undefined
  ) {
    return null;
  }

  // Resolve selected attribute-value ids → "attribute: value" labels via the
  // facets the page already loaded (no extra query, no invented labels).
  const valueLabels = new Map<string, string>();
  for (const attribute of facets.attributes) {
    for (const value of attribute.values) {
      valueLabels.set(value.id, `${attribute.name}: ${value.value}`);
    }
  }

  const chips: AppliedChip[] = [];

  for (const valueId of current.attr) {
    const label = valueLabels.get(valueId);
    if (!label) continue; // unknown value id — the listing ignores it honestly
    chips.push({
      key: `attr:${valueId}`,
      label,
      next: {
        attr: current.attr.filter((id) => id !== valueId),
        stock: current.stock,
        sale: current.sale,
        pmin: current.pmin,
        pmax: current.pmax,
      },
    });
  }
  if (current.stock) {
    chips.push({
      key: "stock",
      label: "المتوفر فقط",
      next: {
        attr: current.attr,
        stock: false,
        sale: current.sale,
        pmin: current.pmin,
        pmax: current.pmax,
      },
    });
  }
  if (current.sale) {
    chips.push({
      key: "sale",
      label: "العروض فقط",
      next: {
        attr: current.attr,
        stock: current.stock,
        sale: false,
        pmin: current.pmin,
        pmax: current.pmax,
      },
    });
  }
  if (current.pmin !== undefined && current.pmax !== undefined) {
    chips.push({
      key: "price",
      label: `السعر: من ${latnNumber(current.pmin)} إلى ${latnNumber(current.pmax)} ج.م.`,
      next: { attr: current.attr, stock: current.stock, sale: current.sale },
    });
  } else if (current.pmin !== undefined) {
    chips.push({
      key: "price-min",
      label: `السعر: من ${latnNumber(current.pmin)} ج.م.`,
      next: {
        attr: current.attr,
        stock: current.stock,
        sale: current.sale,
        pmax: current.pmax,
      },
    });
  } else if (current.pmax !== undefined) {
    chips.push({
      key: "price-max",
      label: `السعر: حتى ${latnNumber(current.pmax)} ج.م.`,
      next: {
        attr: current.attr,
        stock: current.stock,
        sale: current.sale,
        pmin: current.pmin,
      },
    });
  }

  if (chips.length === 0) return null;

  return (
    <nav aria-label="التصفية المطبقة" className="mb-6 flex flex-col gap-1.5">
      <p className="text-xs font-bold text-muted-foreground">التصفية المطبقة:</p>
      <ul className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <li key={chip.key} className="shrink-0">
            <Link
              href={buildCategoryHref(slug, { ...chip.next, sort: current.sort })}
              aria-label={`إزالة التصفية: ${chip.label}`}
              className="inline-flex items-center gap-1.5 rounded-full border bg-surface px-3 py-2 text-xs font-medium text-foreground/85 transition-colors hover:bg-blush/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <X aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              {chip.label}
            </Link>
          </li>
        ))}
        <li className="shrink-0">
          <Link
            href={buildCategoryHref(slug, {
              attr: [],
              stock: false,
              sale: false,
              sort: current.sort,
            })}
            aria-label="مسح كل عوامل التصفية"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:text-destructive/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X aria-hidden className="size-3.5 shrink-0" />
            مسح الكل
          </Link>
        </li>
      </ul>
    </nav>
  );
}
