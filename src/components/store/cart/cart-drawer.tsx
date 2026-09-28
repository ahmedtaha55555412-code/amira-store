'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  CartEmptyState,
  CartLine,
  CartSubtotalBlock,
  CheckoutReadyNote,
} from '@/components/store/cart/cart-line';
import { useCartCount, useCartState } from '@/hooks/use-cart';
import { cartStore } from '@/lib/storefront/cart-store';
import { cartCountPhrase } from '@/lib/storefront/format';

/** Cross-component open signal — the PDP fires it after a successful add. */
const CART_DRAWER_OPEN_EVENT = 'amira:cart-drawer:open';

export function openCartDrawer(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CART_DRAWER_OPEN_EVENT));
}

/**
 * Cart drawer (PHASE-06 task 4): slide-over over every storefront route with
 * the live line count badge, per-line quantity/remove controls, honest
 * stock-aware states, and the subtotal (task 5). Validation (task 6) runs on
 * open when the cache is stale. The full page lives at /cart.
 */
export function CartDrawer() {
  const [open, setOpen] = useState(false);
  const state = useCartState();
  const count = useCartCount();

  useEffect(() => {
    const handleOpen = () => {
      setOpen(true);
      // The auto-open path (add-to-cart event) must refresh stale availability
      // exactly like the manual open path — otherwise entries whose validation
      // is missing after a fresh page load are provisionally counted in the
      // subtotal until the next manual open (ISSUE-042).
      cartStore.scheduleRevalidation();
    };
    window.addEventListener(CART_DRAWER_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(CART_DRAWER_OPEN_EVENT, handleOpen);
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Revalidate stale availability whenever the cart becomes visible.
    if (next) cartStore.scheduleRevalidation();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`سلة التسوق${count > 0 ? ` — ${cartCountPhrase(count)}` : ''}`}
          className="relative text-muted-foreground hover:bg-blush/60 hover:text-foreground"
        >
          <ShoppingBag aria-hidden className="size-5" />
          {count > 0 ? (
            <span
              aria-hidden
              className="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground"
            >
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        role="dialog"
        aria-label="سلة التسوق"
      >
        <SheetHeader className="space-y-1 border-b border-border/70 p-4 text-start">
          <SheetTitle className="flex items-center gap-2 text-base font-bold">
            <ShoppingBag aria-hidden className="size-4 text-primary" />
            سلة التسوق
            {count > 0 ? (
              <span className="rounded-full bg-blush px-2 py-0.5 text-[11px] font-bold text-primary">
                {cartCountPhrase(count)}
              </span>
            ) : null}
          </SheetTitle>
          <SheetDescription className="text-xs">
            تُحفظ سلتك في متصفحك — تبقى كما هي حتى لو أغلقتِ الصفحة.
          </SheetDescription>
        </SheetHeader>

        {state.entries.length === 0 ? (
          <div className="flex flex-1 flex-col p-4">
            <CartEmptyState onBrowse={() => setOpen(false)} />
          </div>
        ) : (
          <>
            <ul className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" aria-label="منتجات السلة">
              {state.entries.map((entry) => (
                <li key={entry.variantId}>
                  <CartLine entry={entry} validation={state.validation[entry.variantId]} />
                </li>
              ))}
            </ul>
            <div className="space-y-3 border-t border-border/70 bg-surface/60 p-4">
              <CartSubtotalBlock />
              <Button type="button" asChild className="w-full rounded-full font-bold">
                <Link href="/cart" onClick={() => setOpen(false)}>
                  عرض السلة الكاملة
                </Link>
              </Button>
              <CheckoutReadyNote />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
