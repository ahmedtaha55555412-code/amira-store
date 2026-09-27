import { cn } from "@/lib/utils";
import { discountPercent, formatPrice } from "@/lib/storefront/format";

type PriceBlockProps = {
  currentPrice: string;
  originalPrice?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Card ranges show "من X إلى Y" — the PDP shows the exact selected price. */
  rangeToPrice?: string | null;
};

/** Price display with honest sale semantics (MASTER_PLAN §7: discount only when current < original). */
export function PriceBlock({
  currentPrice,
  originalPrice,
  size = "sm",
  className,
  rangeToPrice,
}: PriceBlockProps) {
  const percent = originalPrice ? discountPercent(originalPrice, currentPrice) : 0;

  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      {percent > 0 ? (
        <span
          className={cn(
            "rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground",
            size === "lg" && "px-2 py-1 text-xs"
          )}
        >
          خصم {percent}%
        </span>
      ) : null}
      <span
        className={cn(
          "font-bold text-primary",
          size === "sm" && "text-sm",
          size === "md" && "text-lg",
          size === "lg" && "text-2xl sm:text-3xl"
        )}
      >
        {formatPrice(currentPrice)}
      </span>
      {rangeToPrice && rangeToPrice !== currentPrice ? (
        <span className="text-xs text-muted-foreground sm:text-sm">
          — {formatPrice(rangeToPrice)}
        </span>
      ) : null}
      {percent > 0 && originalPrice ? (
        <span
          className={cn(
            "text-muted-foreground line-through",
            size === "sm" ? "text-xs" : "text-sm"
          )}
        >
          {formatPrice(originalPrice)}
        </span>
      ) : null}
    </div>
  );
}
