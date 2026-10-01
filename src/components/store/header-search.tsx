"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Image as ImageIcon, Loader2, Search, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/storefront/format";
import { cn } from "@/lib/utils";

type Suggestions = {
  products: Array<{ slug: string; name: string; priceMin: string | null; imageUrl: string | null }>;
  categories: Array<{ id?: string; name: string; slug: string }>;
};

type SearchStatus = "idle" | "loading" | "done" | "error";

/**
 * Header search with Arabic-aware autocomplete (PHASE-05 task 5):
 * debounced suggestions (products + categories), keyboard-closable,
 * full results via /search. Error and empty suggestions are honest states —
 * the dropdown never fakes content.
 *
 * PACK-06 (UX-07): the listbox is now a complete combobox — the input carries
 * role=combobox + aria-activedescendant and ArrowUp/ArrowDown traverse the
 * flattened options, Home/End jump to the first/last, Enter selects the
 * highlighted option, and Escape closes (preventing the browser's
 * clear-input default). Mouse/touch behavior is untouched; no search API,
 * ranking, or Arabic-matching change.
 */
export function HeaderSearch({ className }: { className?: string }) {
  const router = useRouter();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [suggestions, setSuggestions] = useState<Suggestions>({ products: [], categories: [] });

  const normalizedQuery = query.trim();
  const active = open && normalizedQuery.length >= 2;

  const close = useCallback(() => setOpen(false), []);

  /** Flattened traversal order: categories first, then products. */
  const flatOptions = useMemo(
    () => [
      ...suggestions.categories.map((category) => ({
        key: `cat:${category.slug}`,
        href: `/category/${encodeURIComponent(category.slug)}`,
      })),
      ...suggestions.products.map((product) => ({
        key: `prod:${product.slug}`,
        href: `/product/${encodeURIComponent(product.slug)}`,
      })),
    ],
    [suggestions],
  );
  const [activeIndex, setActiveIndex] = useState(-1);
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  // Keyboard highlight never survives a new result set or a query change.
  useEffect(() => {
    setActiveIndex(-1);
  }, [normalizedQuery, flatOptions]);

  // Keep the highlighted option visible inside the scrollable listbox.
  useEffect(() => {
    if (!active || activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, active]);

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setSuggestions({ products: [], categories: [] });
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/storefront/search/suggestions?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Suggestions;
        setSuggestions({
          products: Array.isArray(data.products) ? data.products : [],
          categories: Array.isArray(data.categories) ? data.categories : [],
        });
        setStatus("done");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setStatus("error");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery]);

  // Close on outside pointer / Escape (combobox dismissal).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const submitSearch = () => {
    if (normalizedQuery.length === 0) return;
    close();
    router.push(`/search?q=${encodeURIComponent(normalizedQuery)}`);
  };

  const hasResults = suggestions.products.length > 0 || suggestions.categories.length > 0;

  /** Combobox keyboard model (PACK-06) — options first, then submit. */
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (open) {
        // preventDefault stops the type=search "clear the field" default.
        event.preventDefault();
        close();
      }
      return;
    }
    if (!active || flatOptions.length === 0) return;
    const count = flatOptions.length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % count);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => (index <= 0 ? count - 1 : index - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(count - 1);
        break;
      case "Enter":
        if (activeIndex >= 0 && flatOptions[activeIndex]) {
          event.preventDefault();
          close();
          router.push(flatOptions[activeIndex].href);
        }
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch();
        }}
      >
        <Input
          type="search"
          role="combobox"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder="ابحثي عن منتج أو قسم…"
          aria-label="ابحث في أميرة استور"
          aria-autocomplete="list"
          aria-expanded={active}
          aria-controls={active ? listboxId : undefined}
          aria-activedescendant={active && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          className="h-10 rounded-full border-border/80 bg-surface pe-10 ps-4 text-sm"
        />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          aria-label="ابدأ البحث"
          className="absolute end-1 top-1/2 size-9 -translate-y-1/2 rounded-full text-muted-foreground hover:text-foreground"
        >
          <Search aria-hidden className="size-4" />
        </Button>
      </form>

      {active ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="اقتراحات البحث"
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-[min(24rem,60vh)] overflow-y-auto rounded-2xl border bg-popover p-2 shadow-lg"
        >
          {status === "loading" ? (
            <p role="status" className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              جارٍ البحث…
            </p>
          ) : null}

          {status === "error" ? (
            <p role="alert" className="px-3 py-3 text-sm text-destructive">
              تعذر جلب الاقتراحات — يمكنك الضغط على زر البحث لعرض النتائج كاملة.
            </p>
          ) : null}

          {status === "done" && !hasResults ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              لا توجد نتائج مطابقة لـ «{normalizedQuery}» — جرّبي كلمة أقصر أو تصفّحي الأقسام.
            </p>
          ) : null}

          {hasResults ? (
            <>
              {suggestions.categories.length > 0 ? (
                <div className="mb-1">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-bold text-gold-deep">أقسام</p>
                  {suggestions.categories.map((category, index) => (
                    <Link
                      key={category.slug}
                      href={`/category/${encodeURIComponent(category.slug)}`}
                      role="option"
                      id={optionId(index)}
                      aria-selected={activeIndex === index}
                      onClick={close}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-blush/60",
                        activeIndex === index && "bg-blush/60",
                      )}
                    >
                      <Store aria-hidden className="size-4 shrink-0 text-primary" />
                      <span className="font-medium">{category.name}</span>
                    </Link>
                  ))}
                </div>
              ) : null}

              {suggestions.products.length > 0 ? (
                <div>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-bold text-gold-deep">منتجات</p>
                  {suggestions.products.map((product, offset) => {
                    const index = suggestions.categories.length + offset;
                    return (
                      <Link
                        key={product.slug}
                        href={`/product/${encodeURIComponent(product.slug)}`}
                        role="option"
                        id={optionId(index)}
                        aria-selected={activeIndex === index}
                        onClick={close}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-blush/60",
                          activeIndex === index && "bg-blush/60",
                        )}
                      >
                        <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-surface-subtle">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt=""
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          ) : (
                            <ImageIcon
                              aria-hidden
                              className="absolute inset-0 m-auto size-4 text-muted-foreground/50"
                            />
                          )}
                        </span>
                        <span className="line-clamp-1 flex-1 text-sm">{product.name}</span>
                        {product.priceMin ? (
                          <span className="shrink-0 text-xs font-bold text-primary">
                            {formatPrice(product.priceMin)}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}

              <button
                type="button"
                onClick={submitSearch}
                className="mt-1 w-full rounded-xl px-3 py-2 text-center text-sm font-semibold text-primary transition-colors hover:bg-blush/60"
              >
                عرض كل النتائج لـ «{normalizedQuery}»
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
