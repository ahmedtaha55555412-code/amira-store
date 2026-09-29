import type { Metadata } from "next";

import { PolicyShell } from "@/components/store/policy-shell";
import { staticPageMetadata } from "@/lib/storefront/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = staticPageMetadata({
  path: "/policies/terms",
  title: "الشروط والأحكام",
  description:
    "شروط استخدام متجر أميرة استور: الطلب والتأكيد عبر واتساب، الأسعار بالجنيه المصري، الدفع عند الاستلام، وتوافر المنتجات.",
});

/**
 * Terms (PHASE-10, decision D-6): factual neutral draft reflecting exactly
 * the documented business rules (MASTER_PLAN §7–§15) — COD only, WhatsApp
 * shipping confirmation, order statuses, moderated reviews. No blanket
 * return/exchange statement that could conflict with applicable Egyptian
 * law: such cases are handled case-by-case through WhatsApp. The owner must
 * review this copy for Egypt before launch (documented).
 */
export default function TermsPage() {
  return (
    <PolicyShell
      title="الشروط والأحكام"
      intro="باستخدامك متجر أميرة استور وإتمام طلب، فإنك توافق على الشروط التالية التي تنظّم العلاقة بينك وبين المتجر."
      updatedAt="2026-09-29"
      sections={[
        {
          heading: "عن المتجر",
          paragraphs: [
            "أميرة استور متجر إلكتروني عائلي يعرض أزياءً ومستحضرات تجميل للعائلة المصرية، ويعمل بالدفع عند الاستلام مع تأكيد تفاصيل الطلب وتكلفة الشحن عبر واتساب.",
          ],
        },
        {
          heading: "الأسعار والعملة",
          bullets: [
            "جميع الأسعار معروضة بالجنيه المصري وتشمل قيمة المنتج فقط.",
            "تكلفة الشحن تُحدد حسب عنوانك وتُتفق عليها معك عبر واتساب قبل تأكيد الطلب.",
            "في حال وجود خصم فعلي على منتج، يظهر السعر المخفّض بجانب السعر الأصلي في صفحة المنتج.",
          ],
        },
        {
          heading: "الطلب والتأكيد",
          bullets: [
            "يُسجَّل طلبك عبر الموقع ثم يتواصل معك الفريق عبر واتساب لتأكيد التفاصيل والاتفاق على تكلفة الشحن.",
            "يُرسل معك ملخص الطلب (المنتجات، الكميات، الأسعار، العنوان) عند إنشائه.",
            "قد يتم إلغاء أي طلب أو تعديله بعد التشاور معك — مثلًا إذا توفّر المنتج أو وُجد خطأ في البيانات.",
          ],
        },
        {
          heading: "الدفع",
          paragraphs: [
            "الدفع عند الاستلام فقط. لا نطلب أي بيانات بطاقات بنكية أو دفع إلكتروني مسبق. يُرجى تجهيز قيمة الطلب نقدًا عند التسليم.",
          ],
        },
        {
          heading: "التوافر والاستبدال",
          paragraphs: [
            "تخضع المنتجات لتوافرها الفعلي بالمخزون، ونحرص على تحديث الكميات لحظيًا.",
            "أي حالة استبدال أو شكوى تتعلق بطلبك تُستقبل عبر واتساب وتُدرس كل حالة حسب ظروفها بما يتوافق مع القوانين المعمول بها في مصر.",
          ],
        },
        {
          heading: "التقييمات والمحتوى",
          paragraphs: [
            "التقييمات المكتوبة وصورها تخضع للمراجعة قبل النشر، ولا تُنشر المحتويات المخالفة للآداب أو غير المتعلقة بتجربة الشراء الفعلية.",
            "صور شهادات واتساب المنشورة في الصفحة الرئيسية منشورة بإذن أصحابها وعُدّلت بياناتها الشخصية عند الحاجة.",
          ],
        },
        {
          heading: "الملكية الفكرية",
          paragraphs: [
            "اسم المتجر وشعاره وتصميم صفحته ومحتوياته من نصوص وصور ملك لأميرة استور، ولا يجوز استخدامها تجاريًا دون إذن مكتوب.",
          ],
        },
        {
          heading: "القانون الواجب التطبيق",
          paragraphs: [
            "تخضع هذه الشروط للقوانين المعمول بها في جمهورية مصر العربية، وتخضع أي نزاعات لمحاكم مصر المختصة.",
          ],
        },
      ]}
    />
  );
}
