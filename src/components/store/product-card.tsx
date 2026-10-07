import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Image as ImageIcon } from "lucide-react";
import { PriceBlock } from "./price-block";
import { WishlistButton } from "./wishlist-button";
import type { StorefrontProductCard as StorefrontProductCardData } from "@/lib/storefront/catalog";
import { cn } from "@/lib/utils";

type ProductCardProps = {
  product: StorefrontProductCardData;
  priority?: boolean;
};

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const outOfStock = product.inStock === false;

  return (
    <article className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border/80 bg-surface shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-gold/35 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
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
              sizes="(max-width: 640px) 48vw, (max-width: 768px) 31vw, (max-width: 1024px) 24vw, (max-width: 1536px) 19vw, 18vw"
              className={cn(
                "object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]",
                outOfStock && "opacity-70 saturate-50",
              )}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <ImageIcon aria-hidden className="size-10 text-muted-foreground/40" />
            </span>
          )}
        </Link>

        <div className="pointer-events-none absolute start-3 top-3 flex flex-col items-start gap-1.5">
          {product.maxDiscountPercent > 0 ? (
            <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-extrabold text-primary-foreground shadow-sm sm:text-[11px]">
              خصم {product.maxDiscountPercent}%
            </span>
          ) : null}
          {outOfStock ? (
            <span className="rounded-full bg-foreground/85 px-2.5 py-1 text-[10px] font-extrabold text-background shadow-sm sm:text-[11px]">
              نفدت الكمية
            </span>
          ) : null}
        </div>

        <WishlistButton
          product={{
            id: product.id,
            slug: product.slug,
            name: product.name,
            imageUrl: product.imageUrl,
          }}
          label={`أضِف «${product.name}» إلى المفضلة`}
          className="absolute end-2.5 top-2.5 rounded-full border border-border/70 bg-surface/90 shadow-sm backdrop-blur-sm"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
        <p className="text-[10px] font-extrabold text-gold-deep sm:text-[11px]">{product.categoryName}</p>
        <h3 className="min-h-[2.7rem] text-sm font-extrabold leading-snug sm:min-h-[2.8rem] sm:text-[0.95rem]">
          <Link
            href={`/product/${encodeURIComponent(product.slug)}`}
            className="line-clamp-2 inline-block rounded-sm py-1 -my-1 transition-colors group-hover:text-primary"
          >
            {product.name}
          </Link>
        </h3>

        <div className="mt-auto flex flex-col gap-2 pt-1">
          {product.priceMin ? (
            <PriceBlock currentPrice={product.priceMin} rangeToPrice={product.priceMax} size="md" />
          ) : (
            <span className="text-sm font-semibold text-muted-foreground">غير متاح حاليًا</span>
          )}
          {outOfStock ? (
            <span className="text-[11px] leading-relaxed text-destructive">غير متوفر حاليًا — يمكنك متابعة تفاصيل المنتج.</span>
          ) : null}
          <Link
            href={`/product/${encodeURIComponent(product.slug)}`}
            className="mt-1 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-border bg-background px-3.5 text-xs font-bold text-foreground/80 transition-colors hover:border-primary hover:bg-blush/45 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            عرض التفاصيل
            <ArrowLeft aria-hidden className="size-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
