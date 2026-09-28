'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, ShoppingBag, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  CartEmptyState,
  CartLine,
  CartSubtotalBlock,
  CheckoutReadyNote,
} from '@/components/store/cart/cart-line';
import { useCartState, useCartSubtotal } from '@/hooks/use-cart';
import { cartStore } from '@/lib/storefront/cart-store';
import { cartCountPhrase } from '@/lib/storefront/format';

/**
 * Full cart page view (PHASE-06 task 4): the drawer's expandable sibling.
 * Client-driven — the route shell is static and this component hydrates the
 * persisted cart, revalidates availability when stale (task 6), and renders
 * the honest checkout posture (checkout itself is PHASE-07; task 9's
 * clear-after-server-confirm contract lives in the cart domain).
 */
export function CartPageView() {
  const state = useCartState();
  const { excludedLineCount } = useCartSubtotal();
  const hasEntries = state.entries.length > 0;

  // Revalidate stale availability whenever entries exist (freshness window
  // lives in the store; this keeps the page honest after returns/refreshes).
  useEffect(() => {
    if (hasEntries) cartStore.scheduleRevalidation();
  }, [hasEntries]);

  if (!state.hydrated) {
    // One hydration frame; keeps SSR markup stable (empty cart shell).
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">جارٍ تحميل السلة…</p>
      </div>
    );
  }

  if (!hasEntries) {
    return <CartEmptyState />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-start lg:gap-8">
      {/* Lines */}
      <section aria-label="منتجات السلة" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-muted-foreground">
            {cartCountPhrase(state.entries.reduce((sum, entry) => sum + entry.quantity, 0))}
          </h2>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 aria-hidden className="size-4" />
                إفراغ السلة
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader className="text-start">
                <AlertDialogTitle>إفراغ السلة بالكامل؟</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم إزالة كل المنتجات من سلتك. لا يمكن التراجع عن هذا الإجراء — يمكنك
                  دائمًا إضافة المنتجات مرة أخرى من المتجر.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => cartStore.clear()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  نعم، إفراغ السلة
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <ul className="flex flex-col gap-3">
          {state.entries.map((entry) => (
            <li key={entry.variantId}>
              <CartLine entry={entry} validation={state.validation[entry.variantId]} />
            </li>
          ))}
        </ul>
      </section>

      {/* Summary card */}
      <aside
        aria-label="ملخص السلة"
        className="flex flex-col gap-4 rounded-2xl border bg-surface p-4 sm:p-6 lg:sticky lg:top-24"
      >
        <h2 className="flex items-center gap-2 font-bold">
          <ShoppingBag aria-hidden className="size-4 text-primary" />
          ملخص الطلب
        </h2>

        <CartSubtotalBlock />

        {excludedLineCount > 0 ? (
          <p className="rounded-xl bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-foreground/80">
            بعض المنتجات غير متاحة حاليًا وأُزيلت من الإجمالي — يمكنك إزالتها أو الإبقاء
            عليها لمتابعة توفرها.
          </p>
        ) : null}

        {/* Checkout CTA — order creation is PHASE-07: one transactional call
            with server-side revalidation; the cart is cleared only after the
            server confirms (task-9 contract). */}
        <Button type="button" asChild size="lg" className="w-full rounded-full text-base font-bold">
          <Link href="/checkout">
            <CreditCard aria-hidden className="size-4" />
            إتمام الطلب — الدفع عند الاستلام
          </Link>
        </Button>
        <CheckoutReadyNote />

        <Button type="button" variant="outline" asChild className="rounded-full font-bold">
          <Link href="/">متابعة التسوق</Link>
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          الإجمالي تقديري — يُعاد التحقق من الأسعار والمخزون من المتجر عند إنشاء الطلب
          فعليًا.
        </p>
      </aside>
    </div>
  );
}
