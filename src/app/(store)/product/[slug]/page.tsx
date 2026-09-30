import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/store/product-detail-client";
import { ProductReviews } from "@/components/store/product-reviews";
import {
  WhatsAppTestimonialCard,
} from "@/components/store/whatsapp-testimonial-card";
import { SizeGuideView } from "@/components/store/size-guide-view";
import { StoreBreadcrumb } from "@/components/store/breadcrumb";
import { Container } from "@/components/store/container";
import { BRAND } from "@/config/brand";
import {
  getStorefrontProductDetail,
  hasStorefrontProductBySlug,
} from "@/lib/storefront/catalog";
import { getProductTestimonials } from "@/lib/storefront/reviews";
import { buildProductJsonLd, serializeJsonLd } from "@/lib/storefront/metadata";
import { ProductSkeleton } from "./product-skeleton";

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
      locale: "ar_EG",
      url: `/product/${detail.product.slug}`,
      images: [
        detail.gallery[0]?.url
          ? { url: detail.gallery[0].url, alt: detail.product.name }
          : { url: BRAND.assets.ogImage, width: 1200, height: 630, alt: detail.product.name },
      ],
    },
  };
}

/**
 * Product detail (PHASE-05 task 11): gallery, variants, size guide, reviews.
 *
 * ISSUE-045 architecture: the route-level `loading.tsx` was removed and the
 * heavy aggregate moved behind an in-page Suspense boundary. The cheap indexed
 * existence probe below is awaited BEFORE any JSX is returned, so — with no
 * route-level loading boundary left — the streaming shell has not flushed yet
 * and `notFound()` still commits a real HTTP 404 for missing slugs. Valid
 * slugs stream the exact former skeleton as the fallback, preserving the
 * loading UX (no blank-white regions, PHASE-01 contract).
 */
export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const decoded = safeDecode(slug);

  if (!(await hasStorefrontProductBySlug(decoded))) notFound();

  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductDetail slug={decoded} />
    </Suspense>
  );
}

/** Heavy aggregate + full UI — streamed inside the page's Suspense boundary. */
async function ProductDetail({ slug }: { slug: string }) {
  const detail = await getStorefrontProductDetail(slug);

  // Defense-in-depth (ISSUE-045): the existence probe and this aggregate are
  // separate queries — if the aggregate misses anyway (e.g. concurrent admin
  // change), still render the honest not-found UI.
  if (!detail) notFound();

  const { product, category, ancestors, attributes, variants, gallery, variantImages, sizeGuide, reviews } = detail;
  // PHASE-09: WhatsApp testimonials linked to this product (published only).
  const productTestimonials = await getProductTestimonials(product.id, 3);

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
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
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

            {productTestimonials.length > 0 ? (
              <section
                id="product-testimonials"
                aria-labelledby="product-testimonials-title"
                className="scroll-mt-24"
              >
                <div className="mb-5 flex flex-col gap-1">
                  <h2 id="product-testimonials-title" className="text-lg font-bold sm:text-xl">
                    شهادات واتساب عن هذا المنتج
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    لقطات شاشة من محادثات واتساب حقيقية — منشورة بإدارة المتجر بعد
                    مراجعة الخصوصية، ومميّزة دائمًا عن مراجعات الموقع.
                  </p>
                </div>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {productTestimonials.map((testimonial, index) => (
                    <li key={testimonial.id} className="h-full">
                      <WhatsAppTestimonialCard testimonial={testimonial} priority={index < 2} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </Container>
      </main>
    </>
  );
}
