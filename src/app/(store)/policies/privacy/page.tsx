import type { Metadata } from "next";

import { PolicyShell } from "@/components/store/policy-shell";
import { getBrandSettings } from "@/lib/branding";
import { staticPageMetadata } from "@/lib/storefront/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { storeName } = await getBrandSettings();

  return staticPageMetadata({
    path: "/policies/privacy",
    title: "سياسة الخصوصية",
    storeName,
    description:
      "سياسة خصوصية أميرة استور: البيانات التي نجمعها عند الطلب (الاسم، رقم الهاتف، العنوان)، غرضها الوحيد، وعدم وجود حسابات أو دفع إلكتروني.",
  });
}

/**
 * Privacy policy (PHASE-10, decision D-6): factual neutral draft describing
 * exactly what the documented system does — guest checkout fields, WhatsApp
 * contact, browser-local cart/wishlist, COD (no card data), no marketing
 * platform. The owner must review this copy for Egypt before launch
 * (documented in EXECUTION_STATUS.md / ISSUE_LOG).
 */
export default function PrivacyPolicyPage() {
  return (
    <PolicyShell
      title="سياسة الخصوصية"
      intro="خصوصيتك مهمة لنا. توضح هذه الصفحة البيانات التي يجمعها متجر أميرة استور، والغرض الوحيد لاستخدامها، وما لا نفعله بياناتك."
      updatedAt="2026-09-29"
      sections={[
        {
          heading: "البيانات التي نجمعها",
          paragraphs: [
            "عند إتمام الطلب نطلب البيانات اللازمة لتنفيذ الطلب وتوصيله فقط:",
          ],
          bullets: [
            "الاسم — لتنسيق الطلب والتواصل معك.",
            "رقم الموبايل — لتأكيد الطلب والتنسيق عبر واتساب ومتابعة التوصيل.",
            "عنوان التوصيل — لتحديد مكان التسليم والاتفاق على تكلفة الشحن.",
            "ملاحظات إضافية (اختيارية) — أي تفاصيل تود إخبارنا بها عن طلبك.",
          ],
        },
        {
          heading: "الغرض من استخدام البيانات",
          paragraphs: [
            "نستخدم بياناتك لتنفيذ طلبك فقط: تأكيد الطلب، ترتيب التوصيل، وتسوية أي ملاحظات تتعلق به. قد نتواصل معك عبر واتساب على الرقم الذي أدخلته بشأن طلبك.",
            "لا نستخدم بياناتك لأي غرض آخر، ولا نبيعها أو نشاركها مع أي جهة خارجية لأغراض تسويقية.",
          ],
        },
        {
          heading: "لا حسابات ولا بيانات دفع",
          paragraphs: [
            "التسوق في أميرة استور لا يتطلب إنشاء حساب أو كلمة مرور.",
            "طريقة الدفع هي الدفع عند الاستلام فقط — لا نطلب أو نخزّن أي بيانات بطاقات بنكية أو محافظ إلكترونية.",
          ],
        },
        {
          heading: "بيانات محفوظة في متصفحك",
          paragraphs: [
            "سلة الشراء وقائمة المفضلة تُحفظ في متصفح جهازك فقط (تخزين محلي) ولا تُرسل إلى خوادمنا إلا عند إتمام الطلب فعليًا. يمكنك حذفها في أي وقت بمسح بيانات المتصفح.",
          ],
        },
        {
          heading: "صور التقييمات",
          paragraphs: [
            "صور التقييمات التي ترفعها تُراجع من إدارة المتجر قبل نشرها، ولا تُعرض للعامة قبل الموافقة عليها. يمكنك طلب حذف تقييمك بمراسلتنا عبر واتساب.",
          ],
        },
        {
          heading: "الاحتفاظ بالبيانات وحقوقك",
          paragraphs: [
            "نحتفظ ببيانات الطلبات كسجلات تشغيلية للمتجر. لطلب توضيح أو تصحيح أو حذف بياناتك، تواصل معنا عبر واتساب وسنساعدك.",
          ],
        },
      ]}
    />
  );
}
