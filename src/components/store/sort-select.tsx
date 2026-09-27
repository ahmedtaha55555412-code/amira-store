"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildCategoryHref, buildSearchHref, type ListingParams } from "@/lib/storefront/urls";

export type SortOption = "newest" | "price-asc" | "price-desc" | "name" | "discount";

const SORT_LABELS: Record<SortOption, string> = {
  newest: "الأحدث",
  "price-asc": "السعر: من الأقل",
  "price-desc": "السعر: من الأعلى",
  name: "الاسم: أ → ي",
  discount: "أقوى الخصومات",
};

/**
 * Serializable sort scope — the server page never passes functions to this
 * client component; URL building is pure (src/lib/storefront/urls.ts).
 */
export type SortScope =
  | { type: "category"; slug: string; base: Omit<ListingParams, "sort" | "page"> }
  | { type: "search"; q?: string };

type SortSelectProps = {
  value: SortOption;
  scope: SortScope;
};

/** Listing sort control (PHASE-05 task 10) — URL-driven, server-rendered results. */
export function SortSelect({ value, scope }: SortSelectProps) {
  const router = useRouter();

  const change = (sort: SortOption) => {
    const href =
      scope.type === "category"
        ? buildCategoryHref(scope.slug, { ...scope.base, sort })
        : buildSearchHref({ q: scope.q, sort });
    router.push(href, { scroll: false });
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-select" className="shrink-0 text-sm text-muted-foreground">
        ترتيب حسب
      </label>
      <Select value={value} onValueChange={(next) => change(next as SortOption)}>
        <SelectTrigger id="sort-select" size="sm" className="w-44 rounded-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
            <SelectItem key={option} value={option}>
              {SORT_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
