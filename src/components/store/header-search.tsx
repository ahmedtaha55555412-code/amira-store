"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Image as ImageIcon, Loader2, Search, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/storefront/format";

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
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="ابحثي عن منتج أو قسم…"
          aria-label="ابحث في أميرة استور"
          aria-autocomplete="list"
          aria-expanded={active}
          aria-controls={active ? listboxId : undefined}
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
                  {suggestions.categories.map((category) => (
                    <Link
                      key={category.slug}
                      href={`/category/${encodeURIComponent(category.slug)}`}
                      role="option"
                      aria-selected={false}
                      onClick={close}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-blush/60"
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
                  {suggestions.products.map((product) => (
                    <Link
                      key={product.slug}
                      href={`/product/${encodeURIComponent(product.slug)}`}
                      role="option"
                      aria-selected={false}
                      onClick={close}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-blush/60"
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
                  ))}
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
