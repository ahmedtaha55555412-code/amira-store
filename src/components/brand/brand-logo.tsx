import { getBrandSettings } from "@/lib/branding";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";
import { BrandCrown } from "./brand-crown";
import { LogoMark } from "./logo-mark";

type BrandLogoProps = {
  /** Custom logo URL (Admin-uploaded). Falls back to brand settings, then the default mark. */
  logoUrl?: string | null;
  variant?: "lockup" | "compact";
  storeName?: string;
  className?: string;
  markClassName?: string;
  logoClassName?: string;
  wordmarkClassName?: string;
  showArabicWordmark?: boolean;
  showEnglishWordmark?: boolean;
  englishWordmarkClassName?: string;
  useCustomLogo?: boolean;
};

/**
 * The shared brand identity component. The store name always remains readable
 * text; an Admin-uploaded logo is an additional mark, never a replacement for
 * the wordmark. The storefront header uses the crown lockup variant.
 *
 * PHASE-10: settings-driven — the resolver reads the store_settings logo
 * reference (public media only, D-4) and falls back to the default mark.
 * Server component; explicit props still win (used by admin surfaces).
 */
export async function BrandLogo({
  logoUrl,
  variant,
  storeName,
  className,
  markClassName,
  logoClassName,
  wordmarkClassName,
  showArabicWordmark = false,
  showEnglishWordmark = false,
  englishWordmarkClassName,
  useCustomLogo = true,
}: BrandLogoProps) {
  const settings = await getBrandSettings();
  const name = storeName ?? settings.storeName;
  const src = useCustomLogo && !variant ? logoUrl ?? settings.logoUrl : null;
  const useCrownLockup =
    Boolean(variant) || (!src && showArabicWordmark && showEnglishWordmark);
  const shouldShowEnglishWordmark = showEnglishWordmark || Boolean(variant);

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-2.5",
        useCrownLockup && "flex-col gap-0",
        variant === "compact" && "gap-0",
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className={cn("h-11 w-auto max-w-28 shrink-0 object-contain", logoClassName)}
        />
      ) : useCrownLockup ? (
        <BrandCrown
          className={cn(
            variant === "compact" ? "h-3 w-5" : "h-4 w-7",
            markClassName,
          )}
        />
      ) : (
        <LogoMark className={cn("h-11 w-11", markClassName)} title={name} />
      )}
      <span
        dir="rtl"
        className={cn(
          "flex min-w-0 flex-col gap-1",
          useCrownLockup && "items-center gap-0.5",
          variant === "compact" && "gap-0",
        )}
      >
        <span
          className={cn(
            "whitespace-nowrap font-extrabold leading-none tracking-tight",
            variant === "compact" ? "text-base" : "text-xl",
            wordmarkClassName,
          )}
          dir="rtl"
          lang="ar"
        >
          {name}
        </span>
        {shouldShowEnglishWordmark ? (
          <span
            dir="ltr"
            lang="en"
            className={cn(
              "whitespace-nowrap text-[0.625rem] font-semibold leading-none tracking-[0.14em] text-gold-deep",
              variant === "compact" && "text-[0.5625rem] tracking-[0.12em]",
              englishWordmarkClassName,
            )}
          >
            {BRAND.storeNameLatin.toUpperCase()}
          </span>
        ) : null}
      </span>
    </span>
  );
}
