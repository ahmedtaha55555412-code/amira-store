import { getBrandSettings } from "@/lib/branding";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo-mark";

type BrandLogoProps = {
  /** Explicitly supplied custom asset. Used only when the caller opts into it. */
  logoUrl?: string | null;
  storeName?: string;
  className?: string;
  markClassName?: string;
  logoClassName?: string;
  wordmarkClassName?: string;
  showArabicWordmark?: boolean;
  showEnglishWordmark?: boolean;
  englishWordmarkClassName?: string;
  useCustomAsset?: boolean;
};

function Crown({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 72 40"
      className={cn("shrink-0 text-gold", className)}
      fill="none"
    >
      <path
        d="M10 11 22 21 36 6l14 15 12-10-7 22H17L10 11Z"
        fill="currentColor"
      />
      <path
        d="M18 32h37"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="9" r="3" fill="currentColor" />
      <circle cx="36" cy="5" r="3" fill="currentColor" />
      <circle cx="62" cy="9" r="3" fill="currentColor" />
    </svg>
  );
}

/**
 * Single storefront brand renderer.
 *
 * The default storefront identity is a designed Arabic/English lockup with a
 * visible crown, so an arbitrary admin-uploaded image cannot collapse the
 * header into an unreadable thumbnail. Settings pages still show and manage
 * the currently uploaded asset independently.
 */
export async function BrandLogo({
  logoUrl,
  storeName,
  className,
  markClassName,
  logoClassName,
  wordmarkClassName,
  showArabicWordmark = false,
  showEnglishWordmark = false,
  englishWordmarkClassName,
  useCustomAsset = false,
}: BrandLogoProps) {
  const settings = await getBrandSettings();
  const name = storeName ?? settings.storeName;
  const src = logoUrl ?? settings.logoUrl;

  if (useCustomAsset && src && !(showArabicWordmark || showEnglishWordmark)) {
    return (
      <span className={cn("inline-flex min-w-0 items-center", className)}>
        <img
          src={src}
          alt={name}
          className={cn("h-11 w-auto max-w-40 shrink-0 object-contain", logoClassName)}
        />
      </span>
    );
  }

  const showArabic = showArabicWordmark || !showEnglishWordmark;
  const showEnglish = showEnglishWordmark;

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-2.5",
        className,
      )}
    >
      {!showArabic && !showEnglish ? (
        <LogoMark className={cn("h-10 w-10", markClassName)} title={name} />
      ) : null}
      {showArabic || showEnglish ? (
        <span className="relative flex min-w-0 flex-col items-center pt-2">
          {showArabic ? (
            <>
              <Crown className="absolute -top-1 h-4 w-7 sm:h-[1.1rem] sm:w-8" />
              <span
                className={cn(
                  "whitespace-nowrap text-[1.05rem] font-extrabold leading-none tracking-tight text-foreground",
                  wordmarkClassName,
                )}
              >
                {name}
              </span>
            </>
          ) : null}
          {showEnglish ? (
            <span
              dir="ltr"
              lang="en"
              className={cn(
                "mt-1 whitespace-nowrap text-[0.58rem] font-semibold uppercase leading-none tracking-[0.24em] text-gold-deep",
                englishWordmarkClassName,
              )}
            >
              {BRAND.storeNameLatin}
            </span>
          ) : null}
          {showArabic && showEnglish ? (
            <span
              aria-hidden="true"
              className="mt-1 h-px w-8 rounded-full bg-gold/80 sm:w-10"
            />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
