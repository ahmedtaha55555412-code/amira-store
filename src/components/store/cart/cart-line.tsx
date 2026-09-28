'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Image as ImageIcon, Minus, PackageX, Plus, TriangleAlert, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCartState, useCartSubtotal } from '@/hooks/use-cart';
import { cartStore } from '@/lib/storefront/cart-store';
import type { CartEntry, CartEntryValidation } from '@/lib/storefront/cart';
import { MAX_LINE_QUANTITY, centsToPriceString } from '@/lib/storefront/cart';
import { formatPrice } from '@/lib/storefront/format';
import { cn } from '@/lib/utils';

/**
 * One cart line, shared by the drawer (dense) and the full cart page (task 4).
 *
 * Stock-aware states (task 6) render honestly:
 * - `low` → warning chip; `out` → destructive chip, steppers frozen;
 * - `unavailable` (variant/product deactivated or branch unreachable) → the
 *   line is visibly not orderable and excluded from the subtotal;
 * - price change → the SERVER-truth price is displayed (the client never
 *   invents prices) with the add-time snapshot struck through.
 */

const STATUS_CHIP: Record<
  CartEntryValidation['status'],
  { text: string; className: string } | null
> = {
  ok: null,
  low: { text: 'كمية محدودة', className: 'bg-warning/15 text-warning border-warning/30' },
  out: { text: 'نفدت الكمية', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  unavailable: {
    text: 'غير متاح حاليًا',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

export type CartLineProps = {
  entry: CartEntry;
  validation: CartEntryValidation | undefined;
};

export function CartLine({ entry, validation }: CartLineProps) {
  const status = validation?.status;
  const orderable = status !== 'out' && status !== 'unavailable';

  // Live stock caps the stepper when known; otherwise the standard ceiling.
  const knownStock = validation?.stockQuantity ?? null;
  const maxQuantity =
    knownStock !== null && knownStock > 0
      ? Math.min(MAX_LINE_QUANTITY, knownStock)
      : MAX_LINE_QUANTITY;

  const priceChanged = validation?.priceChanged === true;
  const displayPrice =
    priceChanged && validation?.currentPrice ? validation.currentPrice : entry.unitPrice;
  const lineCents = Math.round(Number(displayPrice) * 100) * entry.quantity;

  return (
    <article
      aria-label={`${entry.productName} — ${entry.variantLabel}`}
      className={cn(
        'flex gap-3 rounded-2xl border bg-surface p-3',
        status === 'unavailable' && 'opacity-75',
      )}
    >
      {/* Image (client display metadata; graceful placeholder — never broken) */}
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface-subtle sm:size-24">
        {entry.imageUrl ? (
          <Image
            src={entry.imageUrl}
            alt={entry.productName}
            fill
            sizes="96px"
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <ImageIcon aria-hidden className="size-8 text-muted-foreground/40" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold sm:text-base">
              <Link
                href={`/product/${encodeURIComponent(entry.productSlug)}`}
                className="rounded-sm transition-colors hover:text-primary"
              >
                {entry.productName}
              </Link>
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.variantLabel}</p>
            <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
              رمز المتغير: <span dir="ltr" className="font-mono">{entry.variantSku}</span>
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
            aria-label={`إزالة ${entry.productName} (${entry.variantLabel}) من السلة`}
            onClick={() => cartStore.remove(entry.variantId)}
          >
            <X aria-hidden className="size-4" />
          </Button>
        </div>

        {/* Status chips (stock-aware UX, task 6) */}
        {status && STATUS_CHIP[status] ? (
          <p
            className={cn(
              'flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold',
              STATUS_CHIP[status]!.className,
            )}
          >
            {status === 'out' || status === 'unavailable' ? (
              <PackageX aria-hidden className="size-3" />
            ) : (
              <TriangleAlert aria-hidden className="size-3" />
            )}
            {STATUS_CHIP[status]!.text}
          </p>
        ) : null}

        {priceChanged && validation?.currentPrice ? (
          <p className="text-[11px] font-medium text-gold-deep">
            تحدّث السعر — يُحتسب بالسعر الحالي من المتجر
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          {/* Quantity stepper — quantity can never become ≤ 0 (PHASE-06) */}
          <div className="flex items-center rounded-full border border-border bg-background">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full"
              aria-label={`زيادة كمية ${entry.productName}`}
              disabled={!orderable || entry.quantity >= maxQuantity}
              onClick={() => cartStore.updateQuantity(entry.variantId, entry.quantity + 1)}
            >
              <Plus aria-hidden className="size-3.5" />
            </Button>
            <span
              aria-live="polite"
              aria-label={`الكمية: ${entry.quantity}`}
              className="w-8 text-center text-sm font-bold"
            >
              {entry.quantity}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full"
              aria-label={`إنقاص كمية ${entry.productName}`}
              // Never below 1: decrement is disabled at the floor — removal is explicit.
              disabled={!orderable || entry.quantity <= 1}
              onClick={() => cartStore.updateQuantity(entry.variantId, entry.quantity - 1)}
            >
              <Minus aria-hidden className="size-3.5" />
            </Button>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-primary sm:text-base">
              {formatPrice(centsToPriceString(lineCents))}
            </span>
            {priceChanged && validation?.currentPrice ? (
              <span className="text-[11px] text-muted-foreground line-through">
                {formatPrice(centsToPriceString(
                  Math.round(Number(entry.unitPrice) * 100) * entry.quantity,
                ))}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {formatPrice(displayPrice)} للقطعة
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Shared empty-cart body (drawer + page). */
export function CartEmptyState({ onBrowse }: { onBrowse?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-surface-subtle/60 px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-blush text-primary">
        <ImageIcon aria-hidden className="size-7" />
      </span>
      <div className="space-y-1">
        <h3 className="font-bold">سلتك فارغة</h3>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          تصفّحي الأقسام واختاري ما يعجبك — تبقى منتجاتك محفوظة هنا حتى تكملي الطلب.
        </p>
      </div>
      {onBrowse ? (
        <Button type="button" onClick={onBrowse} className="rounded-full font-bold">
          تصفّحي الأقسام
        </Button>
      ) : (
        <Button type="button" asChild className="rounded-full font-bold">
          <Link href="/">تصفّحي الأقسام</Link>
        </Button>
      )}
    </div>
  );
}

/** Honest footer note shared by drawer + page (PHASE-07 checkout is live). */
export function CheckoutReadyNote() {
  return (
    <p className="rounded-xl bg-blush/40 px-3 py-2 text-[11px] leading-relaxed text-foreground/80">
      الدفع عند الاستلام — تُتفق تكلفة الشحن معك عبر واتساب بعد مراجعة العنوان، ويُعاد التحقق من
      الأسعار والمخزون من المتجر عند تأكيد الطلب.
    </p>
  );
}

/**
 * Subtotal block shared by drawer + page (task 5). Uses `useCartSubtotal`
 * (server-truth aware: unavailable lines excluded, price changes adopted).
 */
export function CartSubtotalBlock() {
  const { totalCents, excludedLineCount } = useCartSubtotal();
  const excludedNote =
    excludedLineCount === 1
      ? 'منتج واحد غير محسوب لعدم توفره حاليًا.'
      : excludedLineCount === 2
        ? 'منتجان غير محسوبان لعدم توفرهما حاليًا.'
        : `${excludedLineCount} منتجات غير محسوبة لعدم توفرها حاليًا.`;
  return (
    <div className="space-y-1">
      {excludedLineCount > 0 ? (
        <p className="text-[11px] text-muted-foreground">{excludedNote}</p>
      ) : null}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">إجمالي المنتجات</span>
        <span className="text-lg font-bold text-primary">
          {formatPrice(centsToPriceString(totalCents))}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        تكلفة الشحن تُتفق عليها معك عبر واتساب بعد تأكيد العنوان.
      </p>
    </div>
  );
}
