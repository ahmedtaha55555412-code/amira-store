import { MessageCircle, Star } from "lucide-react";
import { EmptyState } from "./states";
import { Section, SectionHeading } from "./section";

/**
 * Reviews & WhatsApp testimonials placeholders (PHASE-01 shell).
 * Two distinct, honestly labeled entities per MASTER_PLAN §15 — site reviews
 * and admin-managed WhatsApp testimonial screenshots.
 */
export function SocialProofPlaceholder() {
  return (
    <Section id="reviews" aria-labelledby="reviews-title" className="bg-surface-subtle/50">
      <SectionHeading
        id="reviews-title"
        eyebrow="آراء حقيقية فقط"
        title="آراء عملائنا"
        description="يظهر هنا ما يقوله عملاؤنا بعد إطلاق المتجر — بدون أي محتوى مصطنع."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <EmptyState
          icon={Star}
          title="مراجعات المنتجات"
          description="تظهر هنا مراجعات المشترين الموثقة بعد أول عمليات الشراء، مع شارة «مشتري موثّق» للمراجعات المرتبطة بطلبات فعلية."
        />
        <EmptyState
          icon={MessageCircle}
          title="شهادات واتساب"
          description="لقطات شاشة من محادثات واتساب الحقيقية يديرها صاحب المتجر وتُعرض بعد اعتمادها — تُميَّز دائمًا عن مراجعات الموقع."
        />
      </div>
    </Section>
  );
}
