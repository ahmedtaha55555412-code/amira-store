"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { StorefrontFacets } from "@/lib/storefront/catalog";
import { buildCategoryHref } from "@/lib/storefront/urls";
import { cn } from "@/lib/utils";

export type CategoryFilterParams = {
  attr: string[];
  stock: boolean;
  sale: boolean;
  pmin?: string;
  pmax?: string;
  sort?: string;
};

type FiltersPanelProps = {
  facets: StorefrontFacets;
  current: CategoryFilterParams;
  /** Category slug — URLs are built purely inside (no function props). */
  slug: string;
  resultCount: number;
};

/** Inner filter controls shared by the desktop sidebar and the mobile sheet. */
function FilterControls({
  facets,
  current,
  slug,
  resultCount,
  onApplied,
}: FiltersPanelProps & { onApplied?: () => void }) {
  const router = useRouter();

  const apply = (next: CategoryFilterParams) => {
    onApplied?.();
    // Filters reset pagination (page 1) — sort is preserved via `current.sort`.
    router.push(
      buildCategoryHref(slug, { ...next, page: 1 }),
      { scroll: false },
    );
  };

  const toggleValue = (valueId: string, checked: boolean) => {
    const attr = checked ? [...current.attr, valueId] : current.attr.filter((id) => id !== valueId);
    apply({ ...current, attr });
  };

  const activeFilterCount =
    current.attr.length + (current.stock ? 1 : 0) + (current.sale ? 1 : 0) + (current.pmin ? 1 : 0) + (current.pmax ? 1 : 0);

  const hasAnyFilter = activeFilterCount > 0;

  // Price inputs keep local state; "apply" navigates (GET-contract preserved).
  // Sync local inputs when the URL truth changes (adjust-during-render pattern).
  const [priceFrom, setPriceFrom] = useState(current.pmin ?? "");
  const [priceTo, setPriceTo] = useState(current.pmax ?? "");
  const [prevPriceParams, setPrevPriceParams] = useState(`${current.pmin ?? ""}|${current.pmax ?? ""}`);
  const nextPriceParams = `${current.pmin ?? ""}|${current.pmax ?? ""}`;
  if (prevPriceParams !== nextPriceParams) {
    setPrevPriceParams(nextPriceParams);
    setPriceFrom(current.pmin ?? "");
    setPriceTo(current.pmax ?? "");
  }

  const priceValid = useMemo(() => {
    const from = priceFrom === "" ? undefined : Number(priceFrom);
    const to = priceTo === "" ? undefined : Number(priceTo);
    if (from !== undefined && (!Number.isFinite(from) || from < 0)) return false;
    if (to !== undefined && (!Number.isFinite(to) || to < 0)) return false;
    if (from !== undefined && to !== undefined && from > to) return false;
    return true;
  }, [priceFrom, priceTo]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold">
          <SlidersHorizontal aria-hidden className="size-4 text-primary" />
          تصفية النتائج
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-blush px-2 py-0.5 text-[11px] font-bold text-primary">
              {activeFilterCount}
            </span>
          ) : null}
        </p>
        {hasAnyFilter ? (
          <button
            type="button"
            onClick={() =>
              apply({ attr: [], stock: false, sale: false, sort: current.sort })
            }
            className="flex items-center gap-1 rounded-sm text-xs font-semibold text-destructive transition-colors hover:text-destructive/80"
          >
            <X aria-hidden className="size-3.5" />
            مسح التصفية
          </button>
        ) : null}
      </div>

      {/* Availability + sale */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xs font-bold text-muted-foreground">الحالة</legend>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox
            checked={current.stock}
            onCheckedChange={(checked) => apply({ ...current, stock: checked === true })}
            aria-label="المتوفر فقط"
          />
          المتوفر فقط
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox
            checked={current.sale}
            onCheckedChange={(checked) => apply({ ...current, sale: checked === true })}
            aria-label="العروض فقط"
          />
          العروض فقط
        </label>
      </fieldset>

      {/* Price range */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold text-muted-foreground">السعر (ج.م.)</legend>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="من"
            aria-label="أقل سعر"
            value={priceFrom}
            onChange={(event) => setPriceFrom(event.target.value)}
            className="h-9"
          />
          <span aria-hidden className="text-muted-foreground">–</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="إلى"
            aria-label="أعلى سعر"
            value={priceTo}
            onChange={(event) => setPriceTo(event.target.value)}
            className="h-9"
          />
        </div>
        {!priceValid ? (
          <p role="alert" className="text-xs text-destructive">
            أدخل نطاق سعر صحيحًا.
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!priceValid}
          onClick={() =>
            apply({
              ...current,
              pmin: priceFrom === "" ? undefined : priceFrom,
              pmax: priceTo === "" ? undefined : priceTo,
            })
          }
          className="self-start"
        >
          تطبيق السعر
        </Button>
      </fieldset>

      {/* Attribute value facets (category-aware, task 9) */}
      {facets.attributes.map((attribute) => (
        <fieldset key={attribute.id} className="flex flex-col gap-2.5">
          <legend className="mb-1 text-xs font-bold text-muted-foreground">{attribute.name}</legend>
          {attribute.values.map((value) => {
            const checked = current.attr.includes(value.id);
            return (
              <label key={value.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => toggleValue(value.id, next === true)}
                  aria-label={`${attribute.name}: ${value.value} (${value.productCount} منتج)`}
                />
                <span className={cn(checked && "font-semibold")}>{value.value}</span>
                <span className="ms-auto text-[11px] text-muted-foreground">
                  {value.productCount}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}

      {onApplied ? (
        <Button type="button" onClick={onApplied} className="sticky bottom-4 shadow-lg">
          عرض النتائج ({resultCount})
        </Button>
      ) : (
        <p className="sr-only">تصفية النتائج</p>
      )}
    </div>
  );
}

/**
 * Category-aware dynamic filters (PHASE-05 task 9): desktop sidebar, mobile
 * slide-over. Filtering navigates with URL params so results stay shareable
 * and server-rendered (no client-side product state).
 */
export function CategoryFilters(props: FiltersPanelProps) {
  const [open, setOpen] = useState(false);
  const activeFilterCount =
    props.current.attr.length +
    (props.current.stock ? 1 : 0) +
    (props.current.sale ? 1 : 0) +
    (props.current.pmin ? 1 : 0) +
    (props.current.pmax ? 1 : 0);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block" aria-label="تصفية المنتجات">
        <FilterControls {...props} />
      </aside>

      {/* Mobile/tablet trigger + sheet */}
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal aria-hidden className="size-4" />
              تصفية
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-blush px-1.5 text-[11px] font-bold text-primary">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl">
            <SheetHeader className="text-start">
              <SheetTitle>تصفية المنتجات</SheetTitle>
              <SheetDescription>حدّدي ما يناسبك من الخيارات</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">
              <FilterControls {...props} onApplied={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
