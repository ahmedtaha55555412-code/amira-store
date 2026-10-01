import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryFilters, type CategoryFilterParams } from "@/components/store/category-filters";
import { Pagination } from "@/components/store/pagination";
import { ProductCard } from "@/components/store/product-card";
import { ProductGrid } from "@/components/store/product-grid";
import { SortSelect, type SortOption } from "@/components/store/sort-select";
import { StoreBreadcrumb } from "@/components/store/breadcrumb";
import { EmptyState } from "@/components/store/states";
import { Container } from "@/components/store/container";
import { BRAND } from "@/config/brand";
import { itemCountPhrase } from "@/lib/storefront/format";
import {
  getStorefrontCategoryPage,
  getStorefrontFacets,
  hasStorefrontCategoryBySlug,
  listStorefrontProducts,
  parsePriceParam,
  type StorefrontSort,
} from "@/lib/storefront/catalog";
import { CategorySkeleton } from "./category-skeleton";

export const dynamic = "force-dynamic";

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type CategoryFilterState = CategoryFilterParams & { sort: StorefrontSort; page: number };

const SORT_OPTIONS: SortOption[] = ["newest", "price-asc", "price-desc", "name", "discount"];

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getStorefrontCategoryPage(safeDecode(slug));
  if (!page) return { title: "القسم غير موجود", robots: { index: false, follow: false } };
  const title = page.category.name;
  const description =
    page.category.description ??
    `تسوّقي أحدث منتجات قسم «${page.category.name}» من أميرة استور — الدفع عند الاستلام والتوصيل لكل مصر.`;
  return {
    title,
    description,
    alternates: { canonical: `/category/${page.category.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ar_EG",
      url: `/category/${page.category.slug}`,
      // Filtered views keep this same clean canonical/OG identity (PHASE-11:
      // combinatorial filter/query URLs can never become duplicate documents).
      images: [
        { url: BRAND.assets.ogImage, width: 1200, height: 630, alt: page.category.name },
      ],
    },
  };
}

/**
 * Category listing (PHASE-05 tasks 3, 9, 10): subtree products + filters + sort.
 *
 * ISSUE-045 architecture: the route-level `loading.tsx` was removed and the
 * heavy aggregate moved behind an in-page Suspense boundary. The cheap indexed
 * existence probe below is awaited BEFORE any JSX is returned, so — with no
 * route-level loading boundary left — the streaming shell has not flushed yet
 * and `notFound()` still commits a real HTTP 404 for missing slugs. Valid
 * slugs stream the exact former skeleton as the fallback, preserving the
 * loading UX (no blank-white regions, PHASE-01 contract).
 */
export default async function CategoryPage(props: CategoryPageProps) {
  const { slug } = await props.params;
  const query = await props.searchParams;
  const first = (key: string): string | undefined => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const sortRaw = first("sort");
  const sort: StorefrontSort = SORT_OPTIONS.includes(sortRaw as SortOption)
    ? (sortRaw as StorefrontSort)
    : "newest";
  const attrValues = query["attr"];
  const attr: string[] = Array.isArray(attrValues) ? attrValues : attrValues ? [attrValues] : [];

  const filterParams: CategoryFilterState = {
    attr,
    stock: first("stock") === "1",
    sale: first("sale") === "1",
    pmin: parsePriceParam(first("pmin"))?.toString(),
    pmax: parsePriceParam(first("pmax"))?.toString(),
    sort,
    page: Math.max(1, Number(first("page") ?? "1") || 1),
  };

  const decoded = safeDecode(slug);

  if (!(await hasStorefrontCategoryBySlug(decoded))) notFound();

  return (
    <Suspense fallback={<CategorySkeleton />}>
      <CategoryListing slug={decoded} filterParams={filterParams} />
    </Suspense>
  );
}

/** Heavy aggregate + full UI — streamed inside the page's Suspense boundary. */
async function CategoryListing({
  slug,
  filterParams,
}: {
  slug: string;
  filterParams: CategoryFilterState;
}) {
  const data = await getStorefrontCategoryPage(slug);

  // Defense-in-depth (ISSUE-045): the existence probe and this aggregate are
  // separate queries — if the aggregate misses anyway (e.g. concurrent admin
  // change or an unreachable ancestor branch), still render the honest 404.
  if (!data) notFound();
  const { category, ancestors, children, subtreeIds } = data;

  // Group selected attribute values by attribute (facet semantics live in the service).
  const facets = await getStorefrontFacets(subtreeIds);
  const valueToAttribute = new Map<string, string>();
  for (const attribute of facets.attributes) {
    for (const value of attribute.values) valueToAttribute.set(value.id, attribute.id);
  }
  const attributeValueIdsByAttribute: Record<string, string[]> = {};
  for (const valueId of filterParams.attr) {
    const attributeId = valueToAttribute.get(valueId);
    if (!attributeId) continue; // unknown value id — ignored honestly
    (attributeValueIdsByAttribute[attributeId] ??= []).push(valueId);
  }

  const listing = await listStorefrontProducts({
    categoryIds: subtreeIds,
    attributeValueIdsByAttribute,
    onSale: filterParams.sale,
    inStockOnly: filterParams.stock,
    priceMin: filterParams.pmin !== undefined ? Number(filterParams.pmin) : undefined,
    priceMax: filterParams.pmax !== undefined ? Number(filterParams.pmax) : undefined,
    sort: filterParams.sort,
    page: filterParams.page,
  });

  const buildHref = (next: Partial<CategoryFilterParams> & { page?: number }) => {
    const merged = { ...filterParams, ...next, page: next.page ?? 1 };
    const search = new URLSearchParams();
    for (const valueId of merged.attr) search.append("attr", valueId);
    if (merged.stock) search.set("stock", "1");
    if (merged.sale) search.set("sale", "1");
    if (merged.pmin) search.set("pmin", merged.pmin);
    if (merged.pmax) search.set("pmax", merged.pmax);
    if (merged.sort !== "newest") search.set("sort", merged.sort);
    if (merged.page > 1) search.set("page", String(merged.page));
    const queryString = search.toString();
    return `/category/${encodeURIComponent(category.slug)}${queryString ? `?${queryString}` : ""}`;
  };

  const isFiltered =
    filterParams.attr.length > 0 ||
    filterParams.stock ||
    filterParams.sale ||
    filterParams.pmin !== undefined ||
    filterParams.pmax !== undefined;

  const breadcrumbItems = [
    { label: "الرئيسية", href: "/" },
    ...ancestors.map((ancestor) => ({
      label: ancestor.name,
      href: `/category/${encodeURIComponent(ancestor.slug)}`,
    })),
    { label: category.name },
  ];

  return (
    <>
      <div className="border-b border-border/70 bg-surface-subtle/40">
        <Container className="py-4">
          <StoreBreadcrumb items={breadcrumbItems} />
        </Container>
      </div>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Container className="py-8 sm:py-10">
          <header className="mb-6 flex flex-col gap-2 sm:mb-8">
            <h1 className="text-2xl font-bold sm:text-3xl lg:text-4xl">{category.name}</h1>
            {category.description ? (
              <p className="max-w-3xl text-sm leading-loose text-muted-foreground sm:text-base">
                {category.description}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {itemCountPhrase(listing.total)}
            </p>
          </header>

          {children.length > 0 ? (
            <nav aria-label="أقسام فرعية" className="mb-6 flex flex-wrap gap-2">
              {children.map((child) => (
                <Button key={child.id} asChild variant="outline" size="sm" className="rounded-full">
                  <Link href={`/category/${encodeURIComponent(child.slug)}`}>{child.name}</Link>
                </Button>
              ))}
            </nav>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <CategoryFilters
              facets={facets}
              current={filterParams}
              slug={category.slug}
              resultCount={listing.total}
            />

            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {isFiltered ? "النتائج المطابقة للتصفية" : "كل منتجات القسم"}
                </p>
                <SortSelect
                  value={filterParams.sort}
                  scope={{
                    type: "category",
                    slug: category.slug,
                    base: {
                      attr: filterParams.attr,
                      stock: filterParams.stock,
                      sale: filterParams.sale,
                      pmin: filterParams.pmin,
                      pmax: filterParams.pmax,
                    },
                  }}
                />
              </div>

              {listing.items.length === 0 ? (
                isFiltered ? (
                  <EmptyState
                    icon={PackageSearch}
                    title="لا توجد نتائج مطابقة للتصفية"
                    description="جرّبي تعديل أو مسح عناصر التصفية لعرض المزيد من المنتجات."
                    action={
                      <Button asChild variant="outline" className="rounded-full">
                        <Link href={`/category/${encodeURIComponent(category.slug)}`}>مسح كل التصفية</Link>
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={PackageSearch}
                    title="لا توجد منتجات في هذا القسم بعد"
                    description="يعمل فريقنا على إضافة تشكيلات هذا القسم — تابعينا قريبًا."
                    action={
                      <Button asChild className="rounded-full">
                        <Link href="/">العودة للرئيسية</Link>
                      </Button>
                    }
                  />
                )
              ) : (
                <>
                  <ProductGrid>
                    {listing.items.map((product, index) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        priority={index < 4 && filterParams.page === 1}
                      />
                    ))}
                  </ProductGrid>
                  <Pagination
                    page={listing.page}
                    pageCount={listing.pageCount}
                    buildHref={(page) => buildHref({ page })}
                  />
                </>
              )}
            </div>
          </div>
        </Container>
      </main>
    </>
  );
}
