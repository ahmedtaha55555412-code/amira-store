import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/store/product-detail-client";
import { ProductReviews } from "@/components/store/product-reviews";
import { SizeGuideView } from "@/components/store/size-guide-view";
import { StoreBreadcrumb } from "@/components/store/breadcrumb";
import { Container } from "@/components/store/container";
import { getStorefrontProductDetail } from "@/lib/storefront/catalog";
import { buildProductJsonLd } from "@/lib/storefront/metadata";

export const dynamic = "force-dynamic";

type ProductPageProps = { params: Promise<{ slug: string }> };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getStorefrontProductDetail(safeDecode(slug));
  if (!detail) return { title: "المنتج غير موجود", robots: { index: false, follow: false } };
  const description =
    detail.product.metaDescription ??
    detail.product.shortDescription ??
    `اطلبي «${detail.product.name}» من أميرة استور — الدفع عند الاستلام.`;
  return {
    title: detail.product.metaTitle ?? detail.product.name,
    description,
    alternates: {
      canonical: `/product/${detail.product.canonicalSlug ?? detail.product.slug}`,
    },
    openGraph: {
      title: detail.product.metaTitle ?? detail.product.name,
      description,
      type: "website",
      ...(detail.gallery[0]?.url ? { images: [{ url: detail.gallery[0].url }] } : {}),
    },
  };
}

/** Product detail (PHASE-05 task 11): gallery, variants, size guide, reviews. */
export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const detail = await getStorefrontProductDetail(safeDecode(slug));
  if (!detail) notFound();

  const { product, category, ancestors, attributes, variants, gallery, variantImages, sizeGuide, reviews } = detail;

  const breadcrumbItems = [
    { label: "الرئيسية", href: "/" },
    ...ancestors.map((ancestor) => ({
      label: ancestor.name,
      href: `/category/${encodeURIComponent(ancestor.slug)}`,
    })),
    {
      label: category.name,
      href: `/category/${encodeURIComponent(category.slug)}`,
    },
    { label: product.name },
  ];

  // Structured data (task 13) — offers reflect ACTIVE variants only.
  const jsonLd = buildProductJsonLd({
    name: product.name,
    description: product.shortDescription ?? product.description,
    imageUrl: gallery[0]?.url ?? null,
    url: `/product/${encodeURIComponent(product.slug)}`,
    variants: variants.map((variant) => ({
      sku: variant.sku,
      currentPrice: variant.currentPrice,
      stockQuantity: variant.stockQuantity,
      isActive: variant.isActive,
      label:
        variant.assignments.length > 0
          ? variant.assignments
              .map((assignment) => {
                const attributeName = attributes.find((a) => a.id === assignment.attributeId)?.name ?? "";
                const value =
                  attributes
                    .find((a) => a.id === assignment.attributeId)
                    ?.values.find((v) => v.id === assignment.valueId)?.value ?? "";
                return `${attributeName}: ${value}`;
              })
              .join(" · ")
          : null,
    })),
  });

  const fullDescription = product.description?.trim() || product.shortDescription?.trim() || null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="border-b border-border/70 bg-surface-subtle/40">
        <Container className="py-4">
          <StoreBreadcrumb items={breadcrumbItems} />
        </Container>
      </div>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Container className="py-8 sm:py-10">
          <ProductDetailClient
            product={{
              id: product.id,
              name: product.name,
              slug: product.slug,
              shortDescription: product.shortDescription,
              categoryName: category.name,
              categorySlug: category.slug,
            }}
            attributes={attributes}
            variants={variants}
            gallery={gallery}
            variantImages={variantImages}
          />

          <div className="mt-12 flex flex-col gap-10 sm:mt-16">
            {fullDescription ? (
              <section id="details" aria-labelledby="details-title" className="scroll-mt-24">
                <div className="rounded-2xl border bg-surface p-5 sm:p-6">
                  <h2 id="details-title" className="mb-3 text-lg font-bold sm:text-xl">
                    تفاصيل المنتج
                  </h2>
                  <p className="whitespace-pre-line text-sm leading-loose text-foreground/90 sm:text-base">
                    {fullDescription}
                  </p>
                </div>
              </section>
            ) : null}

            {sizeGuide && sizeGuide.rows.length > 0 ? <SizeGuideView guide={sizeGuide} /> : null}

            <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-24">
              <div className="mb-5 flex flex-col gap-1">
                <h2 id="reviews-title" className="text-lg font-bold sm:text-xl">
                  آراء العميلات والعملاء
                </h2>
                <p className="text-sm text-muted-foreground">
                  مراجعات موثقة من مشتريات فعلية — تُنشر بعد الموافقة.
                </p>
              </div>
              <ProductReviews reviews={reviews} />
            </section>
          </div>
        </Container>
      </main>
    </>
  );
}
