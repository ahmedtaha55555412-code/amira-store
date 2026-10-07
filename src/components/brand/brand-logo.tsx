import { getBrandSettings } from "@/lib/branding";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo-mark";

type BrandLogoProps = {
  /** Custom logo URL (Admin-uploaded). Falls back to brand settings, then the default mark. */
  logoUrl?: string | null;
  storeName?: string;
  className?: string;
  markClassName?: string;
  logoClassName?: string;
  wordmarkClassName?: string;
  showArabicWordmark?: boolean;
  showEnglishWordmark?: boolean;
  englishWordmarkClassName?: string;
};

/**
 * The only component feature UI may use to render the store logo.
 * Renders a custom admin-provided logo when available; otherwise renders the
 * default mark + wordmark. Keeps branding replaceable without code edits.
 *
 * PHASE-10: settings-driven — the resolver reads the store_settings logo
 * reference (public media only, D-4) and falls back to the default mark.
 * Server component; explicit props still win (used by admin surfaces).
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
}: BrandLogoProps) {
  const settings = await getBrandSettings();
  const name = storeName ?? settings.storeName;
  const src = logoUrl ?? settings.logoUrl;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn("h-11 w-auto max-w-28 shrink-0 object-contain", logoClassName)}
        />
      ) : (
        <LogoMark className={cn("h-11 w-11", markClassName)} title={name} />
      )}
      <span className="flex min-w-0 flex-col gap-1">
        {!src || showArabicWordmark ? (
          <span className={cn("whitespace-nowrap text-xl font-extrabold leading-none tracking-tight", wordmarkClassName)}>
            {name}
          </span>
        ) : null}
        {showEnglishWordmark ? (
          <span
            dir="ltr"
            lang="en"
            className={cn(
              "whitespace-nowrap text-[0.625rem] font-semibold leading-none tracking-[0.14em] text-gold-deep",
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
