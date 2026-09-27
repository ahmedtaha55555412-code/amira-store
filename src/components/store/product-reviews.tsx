import { MessageSquareQuote, Star } from "lucide-react";
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
 * Product reviews section (PHASE-05 task 11): renders APPROVED reviews only
 * (moderation gate — MASTER_PLAN §15). Submission arrives with PHASE-09, so
 * the empty state is honest and mentions the upcoming capability.
 */
export function ProductReviews({ reviews }: { reviews: StorefrontProductDetail["reviews"] }) {
  if (reviews.count === 0) {
    return (
      <EmptyState
        icon={MessageSquareQuote}
        title="لا توجد مراجعات بعد"
        description="تقييمات العميلات والعملاء ستظهر هنا بعد أول عمليات الشراء — تُنشر بعد المراجعة والموافقة."
        className="bg-surface"
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
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
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
