import Link from "next/link";
import { MessageSquareQuote, PenLine, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "./states";
import type { StorefrontProductDetail } from "@/lib/storefront/catalog";

const dateFormatter = new Intl.DateTimeFormat("ar-EG", { dateStyle: "long" });

function Stars({ rating }: { rating: number }) {
  return (
    <span
      role="img"
      aria-label={`التقييم: ${rating} من 5`}
      className="inline-flex items-center gap-0.5"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          aria-hidden
          className={
            index < rating
              ? "size-4 fill-gold text-gold-deep"
              : "size-4 fill-transparent text-muted-foreground/40"
          }
        />
      ))}
    </span>
  );
}

/**
 * Product reviews section (PHASE-05 aggregate + PHASE-09 completion):
 * renders APPROVED reviews only (moderation gate — MASTER_PLAN §15) with the
 * optional customer image (public asset — materialized at approval time) and
 * the honest submission CTA pointing at the /review entry.
 */
export function ProductReviews({ reviews }: { reviews: StorefrontProductDetail["reviews"] }) {
  return (
    <div className="flex flex-col gap-5">
      {reviews.count > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-surface p-4 sm:p-5">
            <span className="text-4xl font-bold text-primary">
              {reviews.average !== null ? reviews.average.toLocaleString("ar-EG-u-nu-latn") : "—"}
            </span>
            <div className="flex flex-col gap-0.5">
              <Stars rating={Math.round(reviews.average ?? 0)} />
              <span className="text-xs text-muted-foreground">
                {reviews.count === 1
                  ? "مراجعة واحدة معتمدة"
                  : reviews.count === 2
                    ? "مراجعتين معتمدتين"
                    : `${reviews.count.toLocaleString("ar-EG-u-nu-latn")} مراجعات معتمدة`}
              </span>
            </div>
          </div>

          <ul className="flex flex-col gap-3">
            {reviews.items.map((review) => (
              <li key={review.id}>
                <article className="rounded-2xl border bg-surface p-4 sm:p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Stars rating={review.rating} />
                    {review.isVerifiedPurchase ? (
                      <Badge variant="secondary" className="bg-success/10 text-success">
                        مشتري موثّق
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      عميل أميرة استور · {dateFormatter.format(review.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm leading-loose text-foreground">{review.comment}</p>
                  {review.imageUrl ? (
                    <div className="mt-3 w-fit overflow-hidden rounded-xl border bg-surface-subtle/60">
                      {/* Plain <img> per the AssetImage precedent: registry URLs
                          are provider-hosted (Blob) — next/image would require
                          anticipating every provider host (ISSUE-049). */}
                      <img
                        src={review.imageUrl}
                        alt="صورة أرفقها العميل مع تقييمه"
                        loading="lazy"
                        width={96}
                        height={96}
                        className="size-24 object-cover"
                      />
                    </div>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          icon={MessageSquareQuote}
          title="لا توجد مراجعات بعد"
          description="كن أول من يشارك تجربته — تُنشر التقييمات بعد المراجعة والموافقة."
          className="bg-surface"
        />
      )}

      <div className="flex justify-center">
        <Link
          href="/review"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <PenLine aria-hidden className="size-4" />
          اكتب تقييمًا لهذا المنتج
        </Link>
      </div>
    </div>
  );
}
