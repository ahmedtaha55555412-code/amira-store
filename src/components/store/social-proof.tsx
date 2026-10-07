import { MessageCircle, MessageSquareQuote, Star } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "./states";
import { Section, SectionHeading } from "./section";
import {
  VerifiedPurchaseBadge,
  WhatsAppTestimonialCard,
} from "./whatsapp-testimonial-card";
import type {
  PublicReviewCard,
  PublicTestimonialCard,
} from "@/lib/storefront/reviews";

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
 * Homepage social proof (PHASE-09, split into two independent PHASE-10
 * sections) — the two REAL, DISTINCT entities of MASTER_PLAN §4 (items 9–10):
 *  - آراء العملاء: approved SITE reviews only (moderation gate), with the
 *    «مشتري موثّق» verified-purchase label where earned;
 *  - شهادات واتساب: admin-published WhatsApp screenshots, ALWAYS labeled
 *    «عبر واتساب» and never presented as site reviews.
 * Each has an honest empty state, and each is separately visible/orderable
 * from the admin homepage manager (PHASE-10 section visibility contract).
 */

type SectionFraming = {
  title?: string | null;
  subtitle?: string | null;
};

export function SiteReviewsSection({
  reviews,
  framing,
}: {
  reviews: PublicReviewCard[];
  framing?: SectionFraming;
}) {
  return (
    <Section id="reviews" aria-labelledby="reviews-title">
      <SectionHeading
        id="reviews-title"
        eyebrow="آراء حقيقية فقط"
        title={framing?.title ?? "آراء عملائنا"}
        description={
          framing?.subtitle ??
          "مراجعات موقع موثقة من مشترين فعليين — بدون أي محتوى مصطنع."
        }
      />

      {reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title="لا توجد مراجعات منشورة بعد"
          description="تظهر هنا مراجعات المشترين الموثقة بعد أول عمليات الشراء، مع شارة «مشتري موثّق» للمراجعات المرتبطة بطلبات فعلية."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/review"
              className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-blush/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              اكتب تقييمك
            </Link>
          </div>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reviews.map((review) => (
              <li key={review.id} className="h-full">
                <article className="flex h-full flex-col gap-3 rounded-2xl border bg-surface p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Stars rating={review.rating} />
                    {review.isVerifiedPurchase ? <VerifiedPurchaseBadge /> : null}
                  </div>
                  <p className="flex-1 text-sm leading-loose text-foreground">
                    {review.comment}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>عميل أميرة استور · {dateFormatter.format(review.createdAt)}</span>
                    <Link
                      href={`/product/${encodeURIComponent(review.productSlug)}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {review.productName}
                    </Link>
                  </div>
                  {review.imageUrl ? (
                    <div className="relative overflow-hidden rounded-xl border bg-surface-subtle/60">
                      {/* PHASE-09: approved review images are public CDN objects. */}
                      <img
                        src={review.imageUrl}
                        alt={`صورة من تقييم عميل لمنتج ${review.productName}`}
                        loading="lazy"
                        className="max-h-56 w-full object-cover"
                      />
                    </div>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

export function WhatsAppTestimonialsSection({
  testimonials,
  framing,
}: {
  testimonials: PublicTestimonialCard[];
  framing?: SectionFraming;
}) {
  return (
    <Section
      id="testimonials"
      aria-labelledby="testimonials-title"
      className="bg-surface-subtle/50"
    >
      <SectionHeading
        id="testimonials-title"
        eyebrow="عبر واتساب"
        title={framing?.title ?? "شهادات واتساب"}
        description={
          framing?.subtitle ??
          "لقطات حقيقية من محادثات واتساب يديرها صاحب المتجر وتُعرض بعد اعتمادها ومراجعة الخصوصية."
        }
      />

      {testimonials.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="لا توجد شهادات منشورة بعد"
          description="لقطات شاشة من محادثات واتساب حقيقية يديرها صاحب المتجر وتُعرض بعد اعتمادها ومراجعة الخصوصية — تُميَّز دائمًا عن مراجعات الموقع."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <li key={testimonial.id} className="h-full">
              <WhatsAppTestimonialCard testimonial={testimonial} priority={index < 3} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * Composed convenience (both blocks back-to-back) — kept for callers that
 * render the pair together; the homepage now renders them independently.
 */
export function SocialProof({
  reviews,
  testimonials,
}: {
  reviews: PublicReviewCard[];
  testimonials: PublicTestimonialCard[];
}) {
  return (
    <>
      <SiteReviewsSection reviews={reviews} />
      <WhatsAppTestimonialsSection testimonials={testimonials} />
    </>
  );
}
