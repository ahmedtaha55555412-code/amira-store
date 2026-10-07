import { BadgeCheck, MessageCircle, MessageSquareQuote, Star } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "./states";
import { Section, SectionHeading } from "./section";
import { WhatsAppTestimonialCard } from "./whatsapp-testimonial-card";
import type { PublicReviewCard, PublicTestimonialCard } from "@/lib/storefront/reviews";

const dateFormatter = new Intl.DateTimeFormat("ar-EG", { dateStyle: "long" });

function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={`التقييم: ${rating} من 5`} className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          aria-hidden
          className={index < rating ? "size-4 fill-gold text-gold-deep" : "size-4 text-border"}
        />
      ))}
    </span>
  );
}

export function SiteReviewsSection({
  reviews,
  framing,
}: {
  reviews: PublicReviewCard[];
  framing?: { title?: string | null; subtitle?: string | null };
}) {
  return (
    <Section id="reviews" aria-labelledby="reviews-title">
      <SectionHeading
        id="reviews-title"
        align="start"
        eyebrow="آراء حقيقية"
        title={framing?.title ?? "ماذا يقول عملاؤنا؟"}
        description={framing?.subtitle ?? "مراجعات منشورة من مشترين فعليين، مع توضيح المراجعات الموثقة المرتبطة بطلبات فعلية."}
        action={
          <Link
            href="/review"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-blush/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            اكتب تقييمك
            <MessageSquareQuote aria-hidden className="size-4" />
          </Link>
        }
      />

      {reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title="لا توجد مراجعات منشورة بعد"
          description="تظهر هنا مراجعات المشترين بعد اعتمادها، مع شارة «مشتري موثّق» للمراجعات المرتبطة بطلبات فعلية."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reviews.map((review) => (
            <li key={review.id} className="h-full">
              <article className="flex h-full flex-col gap-4 rounded-3xl border border-border/80 bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center justify-between gap-3">
                  <Stars rating={review.rating} />
                  {review.isVerifiedPurchase ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success">
                      <BadgeCheck aria-hidden className="size-3.5" />
                      مشتري موثّق
                    </span>
                  ) : null}
                </div>
                <p className="flex-1 text-sm leading-loose text-foreground">{review.comment}</p>
                <div className="flex flex-col gap-1.5 border-t border-border/70 pt-3">
                  <span className="text-xs text-muted-foreground">عميل أميرة استور · {dateFormatter.format(review.createdAt)}</span>
                  <Link
                    href={`/product/${encodeURIComponent(review.productSlug)}`}
                    className="text-sm font-bold text-primary underline-offset-4 hover:underline"
                  >
                    {review.productName}
                  </Link>
                </div>
                {review.imageUrl ? (
                  <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-subtle">
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
      )}
    </Section>
  );
}

export function WhatsAppTestimonialsSection({
  testimonials,
  framing,
}: {
  testimonials: PublicTestimonialCard[];
  framing?: { title?: string | null; subtitle?: string | null };
}) {
  return (
    <Section id="testimonials" aria-labelledby="testimonials-title" className="bg-surface-subtle/45">
      <SectionHeading
        id="testimonials-title"
        align="start"
        eyebrow="عبر واتساب"
        title={framing?.title ?? "تجارب حقيقية من واتساب"}
        description={framing?.subtitle ?? "لقطات محادثات حقيقية تُعرض بعد اعتمادها ومراجعة الخصوصية، مع إبقائها منفصلة بصريًا عن تقييمات الموقع."}
      />

      {testimonials.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="لا توجد شهادات منشورة بعد"
          description="عند اعتماد لقطات محادثات واتساب، ستظهر هنا في بطاقات واضحة ومميزة."
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
