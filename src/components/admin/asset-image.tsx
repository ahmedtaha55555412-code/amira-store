'use client';

/**
 * Admin asset image — plain <img> for media-registry URLs.
 * Rationale: media URLs may be local placeholders (development seed) or
 * Vercel Blob public URLs (production); remote-pattern configuration for
 * next/image would have to anticipate every provider host. Admin-only usage
 * with lazy loading keeps this acceptable; the storefront uses next/image.
 */

export function AssetImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}
