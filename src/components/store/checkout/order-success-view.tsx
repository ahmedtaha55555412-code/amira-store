'use client';

/**
 * Order success view (PHASE-07).
 *
 * Renders the committed order's customer-facing summary (delivered via
 * sessionStorage from the checkout view — see order-success.ts) and the
 * WhatsApp handoff:
 * - the pre-filled click-to-chat URL is an ordinary anchor — WhatsApp opens
 *   with the message composed and THE CUSTOMER presses Send (never automated);
 * - if WhatsApp fails to open or the device has no WhatsApp, the order REMAINS
 *   valid: the full message text is copyable and the open action is retryable
 *   — both visible on the page, never hidden behind a modal.
 *
 * No payload (direct visit / cleared session) → honest empty state with a
 * path back to the store; there is intentionally NO order lookup here.
 */

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardCopy, MessageCircle, RefreshCw, ShoppingBag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  getOrderSuccessSnapshot,
  getServerOrderSuccessSnapshot,
  subscribeOrderSuccess,
  type OrderSuccessPayload,
} from '@/lib/storefront/order-success';

export function OrderSuccessView() {
  const { toast } = useToast();
  // Hydration-safe sessionStorage read (server snapshot = null; the cached
  // client snapshot switches in after hydration — no setState-in-effect).
  const payload = useSyncExternalStore(
    subscribeOrderSuccess,
    getOrderSuccessSnapshot,
    getServerOrderSuccessSnapshot,
  ) as OrderSuccessPayload | null;
  const [copied, setCopied] = useState(false);

  const copyMessage = async (): Promise<void> => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload.whatsappMessage);
      setCopied(true);
      toast({ title: 'تم نسخ نص الرسالة', description: 'ألصقيها في محادثة واتساب مع المتجر.' });
    } catch {
      // Hardened browsers deny clipboard — reveal the text itself as fallback.
      toast({
        title: 'تعذر النسخ التلقائي',
        description: 'انسخي النص يدويًا من الصندوق بالأسفل.',
      });
    }
  };

  if (!payload) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-surface-subtle/60 px-6 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-blush text-primary">
          <ShoppingBag aria-hidden className="size-7" />
        </span>
        <div className="space-y-1">
          <h1 className="font-bold">لا يوجد طلب حديث في هذا المتصفح</h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            إذا أكملتِ طلبًا للتو فستجدين تفاصيله هنا. يمكنك دائمًا تصفّح المتجر وإتمام طلب جديد.
          </p>
        </div>
        <Button type="button" asChild className="rounded-full font-bold">
          <Link href="/">العودة إلى المتجر</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {/* ---- Confirmation header ---- */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-surface p-6 text-center sm:p-8">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 aria-hidden className="size-8" />
        </span>
        <h1 className="text-xl font-bold sm:text-2xl">تم استلام طلبك بنجاح 🎉</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          طلبك محفوظ عندنا — أكملية بإرسال التفاصيل على واتساب لتأكيد الشحن (الدفع عند الاستلام).
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm text-muted-foreground">رقم الطلب:</span>
          <code dir="ltr" className="rounded-lg bg-blush/50 px-3 py-1 font-mono text-base font-bold tracking-wider text-primary">
            {payload.orderNumber}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-primary"
            aria-label={`نسخ رقم الطلب ${payload.orderNumber}`}
            onClick={() => {
              void navigator.clipboard?.writeText(payload.orderNumber).then(() => {
                toast({ title: 'تم نسخ رقم الطلب' });
              }).catch(() => {
                toast({ title: 'تعذر النسخ التلقائي — انسخي الرقم يدويًا' });
              });
            }}
          >
            <ClipboardCopy aria-hidden className="size-3.5" />
            نسخ
          </Button>
        </div>
      </div>

      {/* ---- WhatsApp handoff (primary action + VISIBLE fallbacks) ---- */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-surface p-4 sm:p-6">
        <h2 className="flex items-center gap-2 font-bold">
          <MessageCircle aria-hidden className="size-4 text-primary" />
          إرسال تفاصيل الطلب على واتساب
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          سيفتح واتساب برسالة جاهزة تحتوي تفاصيل طلبك — تبقى أنتِ من يضغط «إرسال». لو لم يفتح
          واتساب، انسخي نص الرسالة وأرسليه يدويًا — طلبك محفوظ عندنا في الحالتين.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" asChild size="lg" className="flex-1 rounded-full font-bold">
            <a href={payload.whatsappUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden className="size-4" />
              فتح واتساب وإرسال الطلب
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="rounded-full font-bold"
            onClick={() => void copyMessage()}
            aria-live="polite"
          >
            <ClipboardCopy aria-hidden className="size-4" />
            {copied ? 'تم النسخ ✓' : 'نسخ نص الرسالة'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="rounded-full font-bold text-muted-foreground"
            onClick={() => {
              window.open(payload.whatsappUrl, '_blank', 'noopener,noreferrer');
            }}
            aria-label="إعادة محاولة فتح واتساب"
          >
            <RefreshCw aria-hidden className="size-4" />
            إعادة المحاولة
          </Button>
        </div>
        {/* Always-visible message text: the ultimate fallback + transparency. */}
        <details className="rounded-xl border border-border/70 bg-background px-3 py-2">
          <summary className="cursor-pointer text-xs font-bold text-muted-foreground">
            نص الرسالة الجاهزة
          </summary>
          <pre dir="rtl" className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
            {payload.whatsappMessage}
          </pre>
        </details>
      </div>

      {/* ---- Committed order summary ---- */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-surface p-4 sm:p-6">
        <h2 className="font-bold">ملخص الطلب</h2>
        <ul className="flex flex-col gap-2">
          {payload.items.map((item, index) => (
            <li
              key={`${item.productName}-${index}`}
              className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{item.productName}</p>
                {item.attributesLabel ? (
                  <p className="truncate text-[11px] text-muted-foreground">{item.attributesLabel}</p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  الكمية: {item.quantity} · {item.unitPrice} ج.م. للقطعة
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-primary">{item.subtotal} ج.م.</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border/70 pt-3">
          <span className="text-sm font-semibold">إجمالي المنتجات</span>
          <span className="text-lg font-bold text-primary">{payload.productsTotal} ج.م.</span>
        </div>
        <div className="flex flex-col gap-1 text-[11px] leading-relaxed text-muted-foreground">
          <span>طريقة الدفع: {payload.paymentMethod}.</span>
          <span>تكلفة الشحن تُتفق معك على واتساب ثم تُضاف إلى إجمالي الطلب.</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button type="button" asChild variant="outline" className="rounded-full font-bold">
          <Link href="/">متابعة التسوق</Link>
        </Button>
      </div>
    </div>
  );
}
