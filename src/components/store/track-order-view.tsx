"use client";

/**
 * Amira Store — customer order tracking view (PHASE-13).
 *
 * MASTER_PLAN §14: order number + the checkout phone used → a clear order
 * timeline derived from the current order/shipping states. No account, no
 * existence oracle (the server returns one identical generic error for every
 * miss), shipping cost stays "agreed through WhatsApp" while unset (§11).
 */

import { useState } from "react";
import { Check, Loader2, PackageSearch, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TrackingStep = {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
};

type TrackingOrderView = {
  orderNumber: string;
  customerName: string;
  orderStatus: { status: string; label: string };
  shippingStatus: { status: string; label: string };
  paymentStatus: { status: string; label: string };
  productsTotal: string;
  shippingCost: string | null;
  grandTotal: string;
  createdAt: string;
  updatedAt: string;
  items: {
    productName: string;
    attributesLabel: string | null;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }[];
  timeline: { order: TrackingStep[]; shipping: TrackingStep[] };
};

const numberFormat = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatPrice(value: string | number): string {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return "—";
  return `${numberFormat.format(numeric)} ج.م.`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(date);
}

/** Timeline rail shared by the order and shipping chains. */
function Timeline({ title, steps }: { title: string; steps: TrackingStep[] }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold text-foreground">{title}</h3>
      <ol className="flex flex-col gap-0" aria-label={title}>
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const reached = step.done || step.current;
          return (
            <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute start-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5",
                    step.done ? "bg-primary" : "bg-border",
                  )}
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                  step.current
                    ? "border-primary bg-primary text-primary-foreground"
                    : step.done
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground",
                )}
              >
                {step.current ? (
                  <span className="size-2 rounded-full bg-primary-foreground" />
                ) : step.done ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : null}
              </span>
              <span
                className={cn(
                  "pt-0.5 text-sm leading-6",
                  step.current
                    ? "font-bold text-foreground"
                    : step.done
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
                aria-current={step.current ? "step" : undefined}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Honest canceled / failed banner — never rendered as a normal step. */
function StatusBanner({ order }: { order: TrackingOrderView }) {
  const { orderStatus, shippingStatus } = order;
  const isCanceled = orderStatus.status === "canceled";
  const isFailed =
    shippingStatus.status === "delivery_failed" ||
    shippingStatus.status === "returned_to_stock";
  if (!isCanceled && !isFailed) return null;
  const label = isCanceled ? orderStatus.label : shippingStatus.label;
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive"
    >
      <X aria-hidden className="size-4" />
      <span>حالة الطلب الحالية: {label}</span>
    </div>
  );
}

export function TrackOrderView() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<TrackingOrderView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/storefront/track-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), phone: phone.trim() }),
      });
      const data: { ok?: boolean; order?: TrackingOrderView; error?: string } | null =
        await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.order) {
        setError(data?.error ?? "تعذر جلب حالة الطلب — برجاء المحاولة مرة أخرى.");
        setOrder(null);
        return;
      }
      setOrder(data.order);
    } catch {
      setError("تعذر الاتصال بالخدمة — تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
      setOrder(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="track-order-number">رقم الطلب</Label>
          <Input
            id="track-order-number"
            name="orderNumber"
            dir="ltr"
            autoComplete="off"
            placeholder="AMR-4KP7QX"
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            required
            maxLength={16}
            className="text-start"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="track-order-phone">رقم الموبايل المستخدم في الشراء</Label>
          <Input
            id="track-order-phone"
            name="phone"
            dir="ltr"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01012345678"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            maxLength={25}
            className="text-start"
          />
        </div>
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:self-start">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <PackageSearch aria-hidden className="size-4" />}
          تتبع الطلب
        </Button>
      </form>

      {order ? (
        <article
          aria-label={`حالة الطلب ${order.orderNumber}`}
          className="flex flex-col gap-6 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
        >
          <header className="flex flex-col gap-2 border-b border-border/70 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">
                طلب{" "}
                <code dir="ltr" className="rounded-md bg-muted px-2 py-0.5 font-mono text-base">
                  {order.orderNumber}
                </code>
              </h2>
              <span className="rounded-full bg-blush px-3 py-1 text-xs font-bold text-primary">
                {order.orderStatus.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              عميلتنا العزيزة {order.customerName} — آخر تحديث:{" "}
              <time dateTime={order.updatedAt}>{formatDateTime(order.updatedAt)}</time>
            </p>
          </header>

          <StatusBanner order={order} />

          <div className="grid gap-6 sm:grid-cols-2">
            <Timeline title="حالة الطلب" steps={order.timeline.order} />
            <Timeline title="حالة الشحن" steps={order.timeline.shipping} />
          </div>

          <section aria-label="بنود الطلب" className="flex flex-col gap-3 border-t border-border/70 pt-4">
            <h3 className="text-sm font-bold">بنود الطلب</h3>
            <ul className="flex flex-col gap-2">
              {order.items.map((item, index) => (
                <li
                  key={`${item.productName}-${index}`}
                  className="flex flex-col gap-0.5 rounded-xl bg-surface-subtle/60 px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold">{item.productName}</span>
                    <span className="text-sm">{formatPrice(item.subtotal)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.attributesLabel ? `${item.attributesLabel} · ` : ""}
                    الكمية: {numberFormat.format(item.quantity)} · سعر الوحدة:{" "}
                    {formatPrice(item.unitPrice)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="إجماليات الطلب" className="flex flex-col gap-1.5 border-t border-border/70 pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">إجمالي المنتجات</span>
              <span className="font-medium">{formatPrice(order.productsTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الشحن</span>
              <span className="font-medium">
                {order.shippingCost === null
                  ? "يتم الاتفاق عليه عبر واتساب"
                  : formatPrice(order.shippingCost)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border/70 pt-2 text-base font-bold">
              <span>الإجمالي النهائي</span>
              <span>{formatPrice(order.grandTotal)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              طريقة الدفع: الدفع عند الاستلام (كاش) — حالة التحصيل: {order.paymentStatus.label}
            </p>
          </section>
        </article>
      ) : null}
    </div>
  );
}
