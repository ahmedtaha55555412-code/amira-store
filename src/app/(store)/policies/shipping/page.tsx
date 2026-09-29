import type { Metadata } from "next";

import { PolicyShell } from "@/components/store/policy-shell";
import { staticPageMetadata } from "@/lib/storefront/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = staticPageMetadata({
  path: "/policies/shipping",
  title: "سياسة الشحن",
  description:
    "سياسة شحن أميرة استور: تُحدد تكلفة الشحن حسب عنوانك عبر واتساب قبل تأكيد الطلب، والدفع نقدًا عند الاستلام.",
});

/**
 * Shipping policy (PHASE-10, decision D-6): factual neutral draft matching
 * the documented shipping truth — cost finalized through WhatsApp after
 reviewing the address (MASTER_PLAN §9/§11), COD, address accuracy
 * responsibility. No invented delivery-time SLAs. Owner legal review before
 * launch is documented.
 */
export default function ShippingPolicyPage() {
  return (
    <PolicyShell
      title="سياسة الشحن"
      intro="نوصل لجميع محافظات مصر. توضح هذه الصفحة كيفية حساب تكلفة الشحن وترتيبات التسليم بوضوح قبل أن تؤكد طلبك."
      updatedAt="2026-09-29"
      sections={[
        {
          heading: "تكلفة الشحن",
          paragraphs: [
            "لا تُضاف أي رسوم شحن تلقائية على الموقع. بعد تسجيل طلبك، يتواصل معك الفريق عبر واتساب لمراجعة عنوانك والاتفاق معك على تكلفة الشحن المناسبة له، ثم تُثبَّت في طلبك قبل التجهيز.",
            "بهذا تلتزم بأي قيمة قبل مراجعتها واعتمادها — الإجمالي النهائي لطلبك يظهر بوضوح بعد اعتماد تكلفة الشحن.",
          ],
        },
        {
          heading: "مدة التجهيز والتوصيل",
          paragraphs: [
            "نحرص على تجهيز الطلبات المؤكدة في أسرع وقت، ويختلف وقت التوصيل الفعلي حسب المحافظة والعنوان والوقت الذي يناسبك، ويُتفق عليه معك عبر واتساب.",
          ],
        },
        {
          heading: "الدفع عند الاستلام",
          paragraphs: [
            "الدفع نقدًا عند استلام الطلب. يُرجى فحص الطلب أمام مندوب التوصيل والتأكد من مطابقته قبل السداد.",
          ],
        },
        {
          heading: "دقة بيانات العنوان",
          paragraphs: [
            "من مسؤوليتك إدخال عنوان واضح ورقم موبايل صحيح يمكن الوصول إليك عليه. في حال تعذّر التسليم بسبب بيانات غير دقيقة أو عدم الرد على تواصل الفريق، سنعيد التواصل معك لترتيب محاولة تسليم أخرى.",
          ],
        },
        {
          heading: "الشحن لمناطق بعيدة",
          paragraphs: [
            "نوصل لجميع المحافظات، وقد تختلف تكلفة الشحن للمناطق البعيدة أو القرى حسب مصاريف شركة التوصيل الفعلية — وتُعرض عليك بالكامل قبل التأكيد.",
          ],
        },
      ]}
    />
  );
}
