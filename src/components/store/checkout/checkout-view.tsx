'use client';

/**
 * Checkout view (PHASE-07) — the Arabic RTL guest checkout form.
 *
 * Trust posture: the request carries ONLY variant ids + quantities + the
 * customer's typed fields. Prices, stock, product names and SKUs are NOT sent
 * at all — the server re-reads live truth inside one transaction
 * (src/lib/storefront/checkout.ts).
 *
 * Flow: submit (idempotency key generated per cart-content revision) →
 * 200 = server confirmed → cart cleared (PHASE-06 task-9 contract: strictly
 * AFTER server confirm) → payload stored → /order/success.
 * 409 = per-line availability failure → honest banner + per-line messages +
 * cart revalidation (the lines keep their chips); the order does NOT exist.
 * 400/429/500 = banner error; nothing partial anywhere.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Banknote, MapPin, Phone, ShoppingBag, StickyNote, TriangleAlert, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCartState, useCartSubtotal } from '@/hooks/use-cart';
import { cartStore } from '@/lib/storefront/cart-store';
import type { CartEntry } from '@/lib/storefront/cart';
import { normalizeEgyptianPhone } from '@/lib/storefront/whatsapp';
import { centsToMoney, moneyToCents } from '@/lib/storefront/whatsapp';
import { saveSuccessPayload } from '@/lib/storefront/order-success';
import { cn } from '@/lib/utils';

const SUCCESS_ROUTE = '/order/success';

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback (non-secure contexts): still matches the server key grammar.
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Arabic wording per server line-error reason (PHASE-07 contract). */
const LINE_ERROR_TEXT: Record<string, string> = {
  not_found: 'المنتج لم يعد متاحًا — أزيلي الخط من السلة.',
  variant_inactive: 'هذا الخيار لم يعد متاحًا.',
  product_unavailable: 'المنتج غير متاح حاليًا.',
  out_of_stock: 'الكمية المطلوبة لم تعد متوفرة.',
};

export function CheckoutView() {
  const router = useRouter();
  const state = useCartState();
  const { totalCents } = useCartSubtotal();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [lineErrorByVariantId, setLineErrorByVariantId] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // One idempotency key per cart-content revision: double-click/retry of the
  // SAME submission reuses it (idempotent), while any cart edit starts a new
  // submission intent with a fresh key.
  const entriesSignature = useMemo(
    () => state.entries.map((entry) => `${entry.variantId}:${entry.quantity}`).join('|'),
    [state.entries],
  );
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);
  useEffect(() => {
    setIdempotencyKey(generateIdempotencyKey());
  }, [entriesSignature]);

  // Keep a ref of the freshest cart entries for the submit payload.
  const entriesRef = useRef<CartEntry[]>(state.entries);
  entriesRef.current = state.entries;

  const hasEntries = state.entries.length > 0;

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = 'برجاء كتابة الاسم بالكامل.';
    if (!normalizeEgyptianPhone(phone)) {
      errors.phone = 'برجاء كتابة رقم موبايل مصري صحيح (مثال: 01012345678).';
    }
    if (address.trim().length < 5) errors.address = 'برجاء كتابة العنوان بالتفصيل.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return; // double-click guard (plus the server idempotency)
    setBannerError(null);
    setLineErrorByVariantId({});
    if (!validate()) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/storefront/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: entriesRef.current.map((entry) => ({
            variantId: entry.variantId,
            quantity: entry.quantity,
          })),
          customerName: name.trim(),
          customerPhone: phone.trim(),
          address: address.trim(),
          note: note.trim() ? note.trim() : undefined,
          idempotencyKey,
        }),
      });

      if (response.ok) {
        const body = (await response.json()) as { ok: true; order: Parameters<typeof saveSuccessPayload>[0] };
        // Server CONFIRMED — only now may the cart be cleared (task-9 contract).
        cartStore.clear();
        saveSuccessPayload(body.order);
        router.replace(SUCCESS_ROUTE);
        return;
      }

      const body = (await response.json().catch(() => null)) as
        | { ok: false; error: string; lineErrors?: Array<{ variantId: string; reason: string }> }
        | { error: string }
        | null;
      const message = body && 'error' in body ? body.error : 'تعذر إتمام الطلب.';
      setBannerError(message);
      if (body && 'lineErrors' in body && Array.isArray(body.lineErrors)) {
        const mapped: Record<string, string> = {};
        for (const line of body.lineErrors) {
          mapped[line.variantId] = LINE_ERROR_TEXT[line.reason] ?? 'غير متاح حاليًا.';
        }
        setLineErrorByVariantId(mapped);
        // Pull fresh availability into the cart UI (chips + totals update).
        void cartStore.revalidate();
      }
    } catch {
      setBannerError('تعذر الاتصال بالمتجر — تحققي من الشبكة وحاولي مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!state.hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">جارٍ تحميل الطلب…</p>
      </div>
    );
  }

  if (!hasEntries) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-surface-subtle/60 px-6 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-blush text-primary">
          <ShoppingBag aria-hidden className="size-7" />
        </span>
        <div className="space-y-1">
          <h2 className="font-bold">سلتك فارغة</h2>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            أضيفي منتجات إلى سلتك أولًا ثم أكملي بيانات الطلب هنا.
          </p>
        </div>
        <Button type="button" asChild className="rounded-full font-bold">
          <Link href="/">تصفّحي الأقسام</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-start lg:gap-8">
      {/* ------- Customer fields ------- */}
      <section aria-label="بيانات التوصيل" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 rounded-2xl border bg-surface p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-bold">
            <MapPin aria-hidden className="size-4 text-primary" />
            بيانات التوصيل
          </h2>

          <div className="mt-2 flex flex-col gap-1.5">
            <Label htmlFor="checkout-name">الاسم بالكامل</Label>
            <div className="relative">
              <User aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="checkout-name"
                name="name"
                autoComplete="name"
                className="start-10 rounded-xl ps-9"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={fieldErrors.name ? 'checkout-name-error' : undefined}
                maxLength={80}
              />
            </div>
            {fieldErrors.name ? (
              <p id="checkout-name-error" className="text-xs font-medium text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="checkout-phone">رقم الموبايل</Label>
            <div className="relative">
              <Phone aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="checkout-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                autoComplete="tel"
                placeholder="01xxxxxxxxx"
                className="start-10 rounded-xl ps-9 text-start"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                aria-invalid={fieldErrors.phone ? true : undefined}
                aria-describedby={fieldErrors.phone ? 'checkout-phone-error' : undefined}
                maxLength={25}
              />
            </div>
            {fieldErrors.phone ? (
              <p id="checkout-phone-error" className="text-xs font-medium text-destructive">{fieldErrors.phone}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="checkout-address">العنوان بالتفصيل</Label>
            <Textarea
              id="checkout-address"
              name="address"
              rows={3}
              className="rounded-xl"
              placeholder="المحافظة، المدينة، الشارع، رقم العمارة، الدور، علامة مميزة…"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              aria-invalid={fieldErrors.address ? true : undefined}
              aria-describedby={fieldErrors.address ? 'checkout-address-error' : undefined}
              maxLength={500}
            />
            {fieldErrors.address ? (
              <p id="checkout-address-error" className="text-xs font-medium text-destructive">{fieldErrors.address}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="checkout-note">ملاحظات إضافية (اختياري)</Label>
            <div className="relative">
              <StickyNote aria-hidden className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" />
              <Textarea
                id="checkout-note"
                name="note"
                rows={2}
                className="start-10 rounded-xl ps-9"
                placeholder="أي تفاصيل تريدين إخبارنا بها عن طلبك"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
              />
            </div>
          </div>
        </div>

        {/* ------- Payment method (COD — the only method, by design) ------- */}
        <div className="flex flex-col gap-2 rounded-2xl border bg-surface p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-bold">
            <Banknote aria-hidden className="size-4 text-primary" />
            طريقة الدفع
          </h2>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-blush/40 px-3 py-3">
            <span className="flex flex-col">
              <span className="text-sm font-bold">الدفع عند الاستلام</span>
              <span className="text-[11px] leading-relaxed text-muted-foreground">
                تدفعين نقدًا للمندوب عند وصول الطلب.
              </span>
            </span>
            <span className="flex size-5 items-center justify-center rounded-full border-2 border-primary">
              <span className="size-2.5 rounded-full bg-primary" aria-hidden />
            </span>
            <input type="radio" name="payment" value="cod" defaultChecked className="sr-only" aria-label="الدفع عند الاستلام" />
          </label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            تكلفة الشحن غير محسوبة هنا — تُتفق معك عبر واتساب بعد مراجعة العنوان، ثم تُضاف إلى إجمالي الطلب.
          </p>
        </div>
      </section>

      {/* ------- Summary + submit ------- */}
      <aside
        aria-label="ملخص الطلب"
        className="flex flex-col gap-4 rounded-2xl border bg-surface p-4 sm:p-6 lg:sticky lg:top-24"
      >
        <h2 className="flex items-center gap-2 font-bold">
          <ShoppingBag aria-hidden className="size-4 text-primary" />
          ملخص الطلب
        </h2>

        <ul className="flex flex-col gap-2" aria-label="منتجات الطلب">
          {state.entries.map((entry) => {
            const lineCents = moneyToCents(entry.unitPrice) * entry.quantity;
            const lineError = lineErrorByVariantId[entry.variantId];
            return (
              <li key={entry.variantId} className="rounded-xl border border-border/70 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{entry.productName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{entry.variantLabel}</p>
                    <p className="text-[11px] text-muted-foreground">
                      الكمية: {entry.quantity} · {centsToMoney(moneyToCents(entry.unitPrice))} ج.م. للقطعة
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-primary">
                    {centsToMoney(lineCents)} ج.م.
                  </span>
                </div>
                {lineError ? (
                  <p className="mt-1 flex items-start gap-1 rounded-lg bg-destructive/10 px-2 py-1 text-[11px] font-medium leading-relaxed text-destructive">
                    <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
                    {lineError}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between border-t border-border/70 pt-3">
          <span className="text-sm font-semibold">إجمالي المنتجات</span>
          <span className="text-lg font-bold text-primary">{centsToMoney(totalCents)} ج.م.</span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          تكلفة الشحن تُضاف بعد الاتفاق معك على واتساب.
        </p>

        {bannerError ? (
          <p role="alert" className="flex items-start gap-1.5 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium leading-relaxed text-destructive">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {bannerError}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className={cn('w-full rounded-full text-base font-bold', submitting && 'opacity-80')}
        >
          {submitting ? 'جارٍ تأكيد الطلب…' : 'تأكيد الطلب — الدفع عند الاستلام'}
        </Button>
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          بياناتك تُستخدم لتنفيذ الطلب فقط — وسيصلك تأكيد عبر واتساب بعد المراجعة.
        </p>
        <Button type="button" variant="outline" asChild className="rounded-full font-bold">
          <Link href="/cart">العودة إلى السلة</Link>
        </Button>
      </aside>
    </form>
  );
}
