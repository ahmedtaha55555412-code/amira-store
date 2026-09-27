"use client";

import { Heart, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const SOON_MESSAGE =
  "هذه الميزة قيد التطوير وستُتاح مع مرحلة السلة والمفضلة — لا تُعد وظيفة مكتملة حاليًا.";

type SoonFeature = "المفضلة" | "سلة التسوق";

const FEATURE_ICONS = {
  "المفضلة": Heart,
  "سلة التسوق": ShoppingBag,
} as const;

/**
 * Not-yet-active storefront header actions (cart/wishlist, PHASE-06):
 * clearly labeled, never fake functionality. Client component that owns its
 * icons — Lucide components cannot cross the server→client prop boundary.
 */
export function HeaderSoonAction({ feature }: { feature: SoonFeature }) {
  const { toast } = useToast();
  const Icon = FEATURE_ICONS[feature];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${feature} — غير مفعّلة حاليًا، قريبًا`}
      onClick={() =>
        toast({ title: `${feature} — قريبًا`, description: SOON_MESSAGE })
      }
      className="relative text-muted-foreground hover:bg-blush/60 hover:text-foreground"
    >
      <Icon aria-hidden className="size-5" />
      <span aria-hidden className="absolute end-1 top-1 size-1.5 rounded-full bg-gold" />
    </Button>
  );
}
