import { getBrandSettings } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo-mark";

type BrandLogoProps = {
  /** Custom logo URL (Admin-uploaded). Falls back to brand settings, then the default mark. */
  logoUrl?: string | null;
  storeName?: string;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
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
  wordmarkClassName,
}: BrandLogoProps) {
  const settings = await getBrandSettings();
  const name = storeName ?? settings.storeName;
  const src = logoUrl ?? settings.logoUrl;

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          width={40}
          height={40}
          className={cn("h-10 w-10 object-contain", markClassName)}
        />
      ) : (
        <LogoMark className={cn("h-10 w-10", markClassName)} title={name} />
      )}
      <span className={cn("text-xl font-bold leading-none", wordmarkClassName)}>
        {name}
      </span>
    </span>
  );
}
