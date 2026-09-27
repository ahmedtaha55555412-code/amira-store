import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/store/pagination";
import { ProductCard } from "@/components/store/product-card";
import { ProductGrid } from "@/components/store/product-grid";
import { SortSelect, type SortOption } from "@/components/store/sort-select";
import { StoreBreadcrumb } from "@/components/store/breadcrumb";
import { EmptyState, ErrorState } from "@/components/store/states";
import { Container } from "@/components/store/container";
import { getStorefrontCategoryTree, searchStorefrontProducts } from "@/lib/storefront/catalog";
import { normalizeArabic } from "@/lib/storefront/arabic";

export const dynamic = "force-dynamic";

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SORT_OPTIONS: SortOption[] = ["newest", "price-asc", "price-desc", "name", "discount"];

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "البحث",
    description: "ابحثي في منتجات أميرة استور — أزياء العائلة ومستحضرات التجميل.",
    robots: { index: false, follow: true },
  };
}

/** Search results (PHASE-05 tasks 5–8) with every required UX state. */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = await searchParams;
  const first = (key: string): string | undefined => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const rawQuery = (first("q") ?? "").slice(0, 80);
  const normalized = normalizeArabic(rawQuery);
  const sortRaw = first("sort");
  const sort: SortOption = SORT_OPTIONS.includes(sortRaw as SortOption)
    ? (sortRaw as SortOption)
    : "newest";
  const page = Math.max(1, Number(first("page") ?? "1") || 1);

  const buildHref = (next: { sort?: SortOption; page?: number }) => {
    const params = new URLSearchParams();
    if (rawQuery) params.set("q", rawQuery);
    const nextSort = next.sort ?? sort;
    if (nextSort !== "newest") params.set("sort", nextSort);
    const nextPage = next.page ?? page;
    if (nextPage > 1) params.set("page", String(nextPage));
    const queryString = params.toString();
    return `/search${queryString ? `?${queryString}` : ""}`;
  };

  let result: Awaited<ReturnType<typeof searchStorefrontProducts>> | null = null;
  let searchFailed = false;
  if (normalized.length >= 2) {
    try {
      result = await searchStorefrontProducts({ query: rawQuery, sort, page });
    } catch {
      searchFailed = true;
    }
  }

  const categoryTree = await getStorefrontCategoryTree();

  return (
    <>
      <div className="border-b border-border/70 bg-surface-subtle/40">
        <Container className="py-4">
          <StoreBreadcrumb items={[{ label: "الرئيسية", href: "/" }, { label: "البحث" }]} />
        </Container>
      </div>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Container className="py-8 sm:py-10">
          <header className="mb-6 flex flex-col gap-2 sm:mb-8">
            <h1 className="text-2xl font-bold sm:text-3xl">
              {rawQuery ? (
                <>
                  نتائج البحث عن: <span className="text-primary">«{rawQuery}»</span>
                </>
              ) : (
                "البحث في المتجر"
              )}
            </h1>
            {normalized.length < 2 ? (
              <p className="text-sm text-muted-foreground">
                اكتبي كلمتين على الأقل للبحث — يمكنك البحث باسم المنتج أو رمز SKU أو القسم أو القيمة (مقاس، لون، حجم…).
              </p>
            ) : result ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {result.total.toLocaleString("ar-EG-u-nu-latn")}{" "}
                {result.total === 1 ? "نتيجة" : result.total === 2 ? "نتيجتان" : "نتائج"}
              </p>
            ) : null}
          </header>

          {/* Category-aware: matching departments offered as chips */}
          {result && result.matchedCategories.length > 0 ? (
            <nav aria-label="أقسام مطابقة للبحث" className="mb-6 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">أقسام مطابقة:</span>
              {result.matchedCategories.map((matched) => (
                <Button key={matched.id} asChild variant="outline" size="sm" className="rounded-full">
                  <Link href={`/category/${encodeURIComponent(matched.slug)}`}>{matched.name}</Link>
                </Button>
              ))}
            </nav>
          ) : null}

          {searchFailed ? (
            <ErrorState
              title="تعذر تنفيذ البحث"
              description="حدث خطأ أثناء البحث. يمكنك المحاولة مرة أخرى بعد لحظات."
              action={
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={`/search?q=${encodeURIComponent(rawQuery)}`}>إعادة المحاولة</Link>
                </Button>
              }
            />
          ) : normalized.length < 2 ? (
            <EmptyState
              icon={SearchX}
              title="ابدأ البحث"
              description="اكتبي اسم منتج، رمز SKU، قسمًا، أو خاصية مثل المقاس أو اللون."
            />
          ) : result && result.items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="لا توجد نتائج مطابقة"
              description="لم نجد ما يطابق بحثك. جرّبي كلمات أقل أو تصفّحي الأقسام الرئيسية أدناه."
            />
          ) : result ? (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-end">
                <SortSelect value={sort} scope={{ type: "search", q: rawQuery }} />
              </div>
              <ProductGrid>
                {result.items.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 4 && page === 1} />
                ))}
              </ProductGrid>
              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                buildHref={(nextPage) => buildHref({ page: nextPage })}
              />
            </>
          ) : null}

          {/* Always-available discovery path (empty results / short queries) */}
          {(!result || result.items.length === 0) && !searchFailed && normalized.length >= 2 ? (
            <nav aria-label="تصفح الأقسام" className="mt-8 flex flex-wrap justify-center gap-2">
              {categoryTree.map((department) => (
                <Button key={department.id} asChild variant="outline" size="sm" className="rounded-full">
                  <Link href={`/category/${encodeURIComponent(department.slug)}`}>{department.name}</Link>
                </Button>
              ))}
            </nav>
          ) : null}
        </Container>
      </main>
    </>
  );
}
