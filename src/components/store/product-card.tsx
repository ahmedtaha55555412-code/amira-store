import Image from "next/image";
import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
import { PriceBlock } from "./price-block";
import { WishlistButton } from "./wishlist-button";
import type { StorefrontProductCard as StorefrontProductCardData } from "@/lib/storefront/catalog";
import { cn } from "@/lib/utils";

type ProductCardProps = {
  product: StorefrontProductCardData;
  priority?: boolean;
};

/**
 * Product card (PHASE-05 task 4 + DESIGN_SYSTEM card requirements):
 * - no image → brand-tinted placeholder (never a broken image);
 * - sale → percentage badge derived from real variant pricing only;
 * - out of stock → honest overlay + text (browsing stays possible);
 * - wishlist heart → real persistent guest state (PHASE-06 store);
 * - long Arabic titles → line-clamped with reserved height so card rows stay
 *   aligned (UX states requirement).
 */
export function ProductCard({ product, priority = false }: ProductCardProps) {
  const outOfStock = product.inStock === false;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-surface shadow-sm transition-all hover:-translate-y-1 hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
      <div className="relative aspect-[4/5] overflow-hidden bg-surface-subtle">
        <Link
          href={`/product/${encodeURIComponent(product.slug)}`}
          className="absolute inset-0"
          tabIndex={-1}
          aria-hidden="true"
        >
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.imageAlt ?? product.name}
              fill
              priority={priority}
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
              className={cn(
                "object-cover transition-transform duration-300 group-hover:scale-105",
                outOfStock && "opacity-70 saturate-50"
              )}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <ImageIcon aria-hidden className="size-10 text-muted-foreground/40" />
            </span>
          )}
        </Link>

        {/* State badges (top-start in RTL) */}
        <div className="pointer-events-none absolute start-3 top-3 flex flex-col items-start gap-1.5">
          {product.maxDiscountPercent > 0 ? (
            <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow-sm">
              خصم {product.maxDiscountPercent}%
            </span>
          ) : null}
          {outOfStock ? (
            <span className="rounded-md bg-foreground/85 px-2 py-0.5 text-[11px] font-bold text-background shadow-sm">
              نفدت الكمية
            </span>
          ) : null}
        </div>

        {/* Wishlist affordance — real persistent guest state (PHASE-06) */}
        <WishlistButton
          product={{
            id: product.id,
            slug: product.slug,
            name: product.name,
            imageUrl: product.imageUrl,
          }}
          label={`أضِف «${product.name}» إلى المفضلة`}
          className="absolute end-2 top-2 rounded-full bg-surface/85 shadow-sm backdrop-blur"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <p className="text-[11px] font-medium text-gold-deep">{product.categoryName}</p>
        <h3 className="min-h-[2.75rem] text-sm font-bold leading-snug sm:min-h-[2.6rem]">
          <Link
            href={`/product/${encodeURIComponent(product.slug)}`}
            /* PHASE-11 a11y (WCAG 2.2 AA 2.5.8): py extends the touch target
               past the 24px minimum while -my keeps the reserved card rhythm. */
            className="line-clamp-2 inline-block rounded-sm py-1 -my-1 transition-colors group-hover:text-primary"
          >
            {product.name}
          </Link>
        </h3>
        <div className="mt-auto flex flex-col gap-1 pt-1">
          {product.priceMin ? (
            <PriceBlock
              currentPrice={product.priceMin}
              rangeToPrice={product.priceMax}
            />
          ) : (
            <span className="text-sm font-semibold text-muted-foreground">غير متاح حاليًا</span>
          )}
          {outOfStock ? (
            <span className="text-xs text-destructive">غير متوفر حاليًا — تابعنا لعودة المخزون</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
