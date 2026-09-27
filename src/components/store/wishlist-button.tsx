"use client";

import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useWishlistHas } from "@/hooks/use-wishlist";
import { wishlistStore } from "@/lib/storefront/wishlist-store";
import { cn } from "@/lib/utils";

export type WishlistProduct = {
  id: string;
  slug: string;
  name: string;
  imageUrl?: string | null;
};

type WishlistButtonProps = {
  /** Product identity — the whole wishlist key is the product (PHASE-06). */
  product: WishlistProduct;
  /** Accessible name context (card vs product page wording). */
  label?: string;
  className?: string;
};

/**
 * Guest wishlist toggle (PHASE-06 task 7): persists to the browser's local
 * storage via the wishlist store — the visible state is REAL now, shared by
 * every surface (cards, PDP, drawer) through the same store. No account, no
 * server calls.
 */
export function WishlistButton({
  product,
  label = "أضِف إلى المفضلة",
  className,
}: WishlistButtonProps) {
  const { toast } = useToast();
  const wishlisted = useWishlistHas(product.id);

  const handleToggle = () => {
    const added = wishlistStore.toggle({
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      imageUrl: product.imageUrl ?? null,
    });
    toast({
      title: added ? "أُضيف إلى المفضلة ♥" : "أُزيل من المفضلة",
      description: added
        ? `«${product.name}» محفوظ في متصفحك — تجدينه في قائمة المفضلة أعلى الصفحة.`
        : `تمت إزالة «${product.name}» من قائمة المفضلة.`,
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={
        wishlisted
          ? `إزالة «${product.name}» من المفضلة`
          : `${label} — يُحفظ في متصفحك`
      }
      aria-pressed={wishlisted}
      onClick={handleToggle}
      className={cn(
        "text-muted-foreground hover:bg-blush/60 hover:text-destructive",
        wishlisted && "text-destructive hover:text-destructive",
        className
      )}
    >
      <Heart aria-hidden className={cn("size-5", wishlisted && "fill-destructive")} />
    </Button>
  );
}
