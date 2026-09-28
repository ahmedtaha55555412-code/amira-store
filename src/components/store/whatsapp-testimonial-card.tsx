import Link from "next/link";
import { BadgeCheck, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PublicTestimonialCard } from "@/lib/storefront/reviews";

const dateFormatter = new Intl.DateTimeFormat("ar-EG", { dateStyle: "long" });

/**
 * WhatsApp testimonial card (PHASE-09). ACCURATE LABELING is a hard
 * requirement (MASTER_PLAN §15): a WhatsApp screenshot is presented AS a
 * WhatsApp screenshot — the card carries the «عبر واتساب» badge and never a
 * site-review rating or the «مشتري موثّق» verified-purchase label. Display
 * name/city/caption are optional admin-entered metadata.
 */
export function WhatsAppTestimonialCard({
  testimonial,
  priority = false,
  className,
}: {
  testimonial: PublicTestimonialCard;
  priority?: boolean;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "flex h-full flex-col gap-3 overflow-hidden rounded-2xl border bg-surface p-4",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-xl border bg-surface-subtle/60">
        {/* Plain <img> per the AssetImage precedent (ISSUE-049): registry URLs
            are provider-hosted — next/image would require anticipating every
            provider host. */}
        <img
          src={testimonial.imageUrl}
          alt={
            testimonial.imageAlt ??
            `لقطة شاشة واتساب من عميل${testimonial.displayName ? ` — ${testimonial.displayName}` : ""}`
          }
          loading={priority ? "eager" : "lazy"}
          width={testimonial.imageWidth ?? 600}
          height={testimonial.imageHeight ?? 600}
          className="h-auto w-full object-cover"
        />
      </div>

      <figcaption className="flex flex-1 flex-col gap-2">
        {testimonial.caption ? (
          <p className="text-sm leading-loose text-foreground/90">{testimonial.caption}</p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Badge
            icon={<MessageCircle aria-hidden className="size-3" />}
            label="عبر واتساب"
            title="لقطة شاشة من محادثة واتساب حقيقية — منشورة بإدارة المتجر بعد مراجعة الخصوصية"
          />
          {testimonial.displayName ? (
            <span className="text-sm font-semibold text-foreground">
              {testimonial.displayName}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">عميل أميرة استور</span>
          )}
          {testimonial.city ? (
            <span className="text-xs text-muted-foreground">— {testimonial.city}</span>
          ) : null}
        </div>

        {testimonial.productSlug && testimonial.productName ? (
          <Link
            href={`/product/${encodeURIComponent(testimonial.productSlug)}`}
            className="w-fit text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            المنتج المرتبط: {testimonial.productName}
          </Link>
        ) : null}
      </figcaption>
    </figure>
  );
}

/**
 * Verified-purchase badge for SITE reviews — the ONLY label allowed to say
 * «مشتري موثّق». Kept here so the two labels can never be confused.
 */
export function VerifiedPurchaseBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
      <BadgeCheck aria-hidden className="size-3.5" />
      مشتري موثّق
    </span>
  );
}

function Badge({ icon, label, title }: { icon: React.ReactNode; label: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-blush px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground"
    >
      {icon}
      {label}
    </span>
  );
}

export { dateFormatter };
