'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, Heart, Image as ImageIcon, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useWishlistState } from '@/hooks/use-wishlist';
import { wishlistStore } from '@/lib/storefront/wishlist-store';
import { itemCountPhrase } from '@/lib/storefront/format';

/**
 * Guest wishlist drawer (PHASE-06 task 7): local-to-the-browser saved products
 * with persistence across refreshes. No account, no server state — removing
 * an item here is purely local (MASTER_PLAN §8).
 */
export function WishlistDrawer() {
  const [open, setOpen] = useState(false);
  const state = useWishlistState();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`المفضلة${state.items.length > 0 ? ` — ${itemCountPhrase(state.items.length)}` : ''}`}
          className="relative max-xl:size-11 rounded-full text-muted-foreground hover:bg-blush/60 hover:text-destructive"
        >
          <Heart aria-hidden className="size-5" />
          {state.items.length > 0 ? (
            <span
              aria-hidden
              className="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-primary-foreground"
            >
              {state.items.length > 99 ? '99+' : state.items.length}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        role="dialog"
        aria-label="قائمة المفضلة"
      >
        {state.persistenceStatus === 'failed' ? (
          <div
            role="alert"
            className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
          >
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>تعذر حفظ المفضلة في المتصفح. يمكنك المتابعة الآن، لكن قد تضيع التغييرات بعد تحديث الصفحة أو إغلاقها.</p>
          </div>
        ) : null}

        <SheetHeader className="space-y-1 border-b border-border/70 p-4 text-start">
          <SheetTitle className="flex items-center gap-2 text-base font-bold">
            <Heart aria-hidden className="size-4 text-destructive" />
            قائمة المفضلة
          </SheetTitle>
          <SheetDescription className="text-xs">
            تُحفظ مفضلتك في متصفحك فقط — بدون حساب وبخصوصية كاملة.
          </SheetDescription>
        </SheetHeader>

        {state.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-blush text-destructive">
              <Heart aria-hidden className="size-7" />
            </span>
            <div className="space-y-1">
              <h3 className="font-bold">مفضلتك فارغة</h3>
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                اضغطي على رمز القلب في أي منتج لتحفظيه هنا وتعودي إليه لاحقًا.
              </p>
            </div>
            <Button type="button" asChild className="rounded-full font-bold" onClick={() => setOpen(false)}>
              <Link href="/">تصفّحي الأقسام</Link>
            </Button>
          </div>
        ) : (
          <>
            <ul
              className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
              aria-label="منتجات المفضلة"
            >
              {state.items.map((item) => (
                <li
                  key={item.productId}
                  className="flex gap-3 rounded-2xl border bg-surface p-3"
                >
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-subtle sm:size-20">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.productName}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <ImageIcon aria-hidden className="size-7 text-muted-foreground/40" />
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="truncate text-sm font-bold">
                      <Link
                        href={`/product/${encodeURIComponent(item.productSlug)}`}
                        onClick={() => setOpen(false)}
                        className="rounded-sm transition-colors hover:text-primary"
                      >
                        {item.productName}
                      </Link>
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      محفوظ في مفضلتك — يتاح التسعير والشراء من صفحة المنتج
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => wishlistStore.remove(item.productId)}
                      className="mt-auto w-fit gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                      إزالة من المفضلة
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border/70 bg-surface/60 p-4">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                المفضلة قائمة حفظ شخصية — اختاري «أضيفي إلى السلة» من صفحة المنتج لتبدأ
                الشراء.
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
