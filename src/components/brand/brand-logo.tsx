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
  /** `auto` respects the saved asset; `lockup` is the approved crown wordmark; `compact` is the small mark + text treatment. */
  variant?: "auto" | "lockup" | "compact";
};

function LockupSvg({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 620 180"
      role="img"
      aria-label={`${name} — ${BRAND.storeNameLatin.toUpperCase()}`}
      className={cn("block h-auto w-full", className)}
    >
      <title>{name} — {BRAND.storeNameLatin.toUpperCase()}</title>
      <g transform="translate(238 6)">
        <path
          d="M72 42 54 20 91 31 124 5l33 26 37-11-18 22H72Z"
          fill="currentColor"
          className="text-gold"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="M70 46h126" fill="none" stroke="currentColor" className="text-gold" strokeWidth="9" strokeLinecap="round" />
        <circle cx="54" cy="20" r="4.5" fill="currentColor" className="text-gold-deep" />
        <circle cx="91" cy="31" r="4.5" fill="currentColor" className="text-gold-deep" />
        <circle cx="124" cy="5" r="5" fill="currentColor" className="text-gold-deep" />
        <circle cx="157" cy="31" r="4.5" fill="currentColor" className="text-gold-deep" />
        <circle cx="194" cy="20" r="4.5" fill="currentColor" className="text-gold-deep" />
      </g>
      <text
        x="310"
        y="105"
        textAnchor="middle"
        fontFamily="Cairo, 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif"
        fontSize="62"
        fontWeight="800"
        fill="currentColor"
        className="text-foreground"
      >
        {name}
      </text>
      <path d="M187 125h246" stroke="currentColor" className="text-gold-deep" strokeWidth="3" strokeLinecap="round" />
      <text
        x="310"
        y="158"
        textAnchor="middle"
        fontFamily="Arial, 'Segoe UI', sans-serif"
        fontSize="19"
        fontWeight="700"
        letterSpacing="4.5"
        fill="currentColor"
        className="text-primary"
      >
        {BRAND.storeNameLatin.toUpperCase()}
      </text>
    </svg>
  );
}

/** Shared brand renderer used by storefront/admin chrome. */
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
  variant = "auto",
}: BrandLogoProps) {
  const settings = await getBrandSettings();
  const name = storeName ?? settings.storeName;

  if (variant === "lockup") {
    return (
      <span className={cn("inline-flex shrink-0", className)}>
        <LockupSvg name={name} className={logoClassName} />
      </span>
    );
  }

  const src = logoUrl ?? settings.logoUrl;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      {variant === "compact" ? (
        <LogoMark className={cn("size-10 shrink-0", markClassName)} title={name} />
      ) : src ? (
        <img
          src={src}
          alt={name}
          className={cn("h-11 w-auto max-w-28 shrink-0 object-contain", logoClassName)}
        />
      ) : (
        <LogoMark className={cn("h-11 w-11 shrink-0", markClassName)} title={name} />
      )}

      <span className="flex min-w-0 flex-col gap-1">
        {!src || showArabicWordmark || variant === "compact" ? (
          <span className={cn("whitespace-nowrap text-xl font-extrabold leading-none tracking-tight", wordmarkClassName)}>
            {name}
          </span>
        ) : null}
        {showEnglishWordmark || variant === "compact" ? (
          <span
            dir="ltr"
            lang="en"
            className={cn("whitespace-nowrap text-[0.625rem] font-semibold leading-none tracking-[0.14em] text-gold-deep", englishWordmarkClassName)}
          >
            {BRAND.storeNameLatin.toUpperCase()}
          </span>
        ) : null}
      </span>
    </span>
  );
}
