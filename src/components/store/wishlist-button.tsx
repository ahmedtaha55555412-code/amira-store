"use client";

import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SOON_MESSAGE =
  "قائمة المفضلة تُحفظ في المتصفح وستُتاح مع مرحلة السلة والمفضلة — لا تُعد وظيفة مكتملة حاليًا.";

type WishlistButtonProps = {
  /** Accessible name; include context (card vs product page). */
  label?: string;
  /** Visual wishlist state — persistence arrives with PHASE-06 (guest wishlist). */
  wishlisted?: boolean;
  className?: string;
};

/**
 * Wishlist affordance with an honest PHASE-05 contract: the button and its
 * active/inactive STATE render today (cards requirement), clicking explains
 * that persistence comes with the cart phase — it never fakes a saved item.
 */
export function WishlistButton({
  label = "أضِف إلى المفضلة",
  wishlisted = false,
  className,
}: WishlistButtonProps) {
  const { toast } = useToast();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`${label} — المفضلة تُتاح في المرحلة التالية`}
      aria-pressed={wishlisted}
      onClick={() =>
        toast({
          title: wishlisted ? "المفضلة — قريبًا" : "أضيفت للمفضلة (معاينة)",
          description: SOON_MESSAGE,
        })
      }
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
