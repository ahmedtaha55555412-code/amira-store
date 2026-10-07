import Link from "next/link";
import { Menu } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BrandLogo } from "@/components/brand/brand-logo";
import { CartDrawer } from "@/components/store/cart/cart-drawer";
import { WishlistDrawer } from "@/components/store/wishlist/wishlist-drawer";
import { cn } from "@/lib/utils";
import { getStorefrontCategoryTree } from "@/lib/storefront/catalog";
import { itemCountPhrase } from "@/lib/storefront/format";
import { HeaderSearch } from "./header-search";
import { Container } from "./container";

/** Refined storefront header: premium master lockup, direct department links, and intentional mobile search row. */
export async function StoreHeader() {
  const tree = await getStorefrontCategoryTree();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/90">
      <Container className="flex min-h-[4.25rem] items-center justify-between gap-2 py-2.5 sm:gap-4 sm:py-3 xl:min-h-[5.25rem] xl:py-3.5">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
          <Sheet>
            <SheetTrigger
              data-slot="button"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-11 shrink-0 rounded-full text-foreground/80 hover:bg-blush/60 xl:hidden",
              )}
              aria-label="فتح قائمة الأقسام"
            >
              <Menu aria-hidden className="size-5" />
            </SheetTrigger>
            <SheetContent side="right" className="flex w-[min(88vw,22rem)] flex-col">
              <SheetHeader className="text-start">
                <div className="mb-1 flex items-center gap-3">
                  <BrandLogo variant="compact" wordmarkClassName="text-lg" />
                </div>
                <SheetTitle>أقسام المتجر</SheetTitle>
                <SheetDescription>تصفّحي الأقسام واختاري ما يناسبك.</SheetDescription>
              </SheetHeader>
              <nav aria-label="تنقل الجوال" className="flex-1 overflow-y-auto px-4 pb-8">
                <ul className="flex flex-col gap-1">
                  <li>
                    <Link
                      href="/"
                      className="block rounded-xl px-3 py-3 text-sm font-bold transition-colors hover:bg-blush/60 focus-visible:bg-blush/60"
                    >
                      الرئيسية
                    </Link>
                  </li>
                  {tree.map((department) => (
                    <li key={department.id}>
                      <Link
                        href={`/category/${encodeURIComponent(department.slug)}`}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors hover:bg-blush/60 focus-visible:bg-blush/60"
                      >
                        <span>{department.name}</span>
                        <span className="shrink-0 rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                          {department.productCount > 0
                            ? itemCountPhrase(department.productCount)
                            : "لا توجد منتجات بعد"}
                        </span>
                      </Link>
                      {department.children.length > 0 ? (
                        <ul className="ms-4 mt-1 flex flex-col gap-0.5 border-s border-border/70 ps-3">
                          {department.children.map((child) => (
                            <li key={child.id}>
                              <Link
                                href={`/category/${encodeURIComponent(child.slug)}`}
                                className="block rounded-lg px-3 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-blush/60 focus-visible:bg-blush/60"
                              >
                                {child.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </nav>
            </SheetContent>
          </Sheet>

          <Link
            href="/"
            aria-label="أميرة استور — الصفحة الرئيسية"
            className="min-w-0 shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <BrandLogo
              variant="lockup"
              logoClassName="h-10 w-[8.6rem] sm:h-11 sm:w-[9.8rem] xl:h-14 xl:w-[12.5rem]"
            />
          </Link>
        </div>

        <nav aria-label="أقسام المتجر" className="hidden min-w-0 flex-1 justify-center xl:flex">
          <ul className="flex items-center gap-1.5 2xl:gap-2">
            {tree.map((department) => (
              <li key={department.id}>
                <Link
                  href={`/category/${encodeURIComponent(department.slug)}`}
                  className="inline-flex min-h-11 items-center rounded-full px-3 py-2 text-[13px] font-semibold text-foreground/80 transition-colors hover:bg-blush/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring 2xl:px-3.5 2xl:text-sm"
                >
                  {department.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5 xl:gap-1">
          <HeaderSearch className="hidden w-44 2xl:w-56 xl:block" />
          <WishlistDrawer />
          <CartDrawer />
        </div>
      </Container>

      <div className="border-t border-border/60 bg-surface-subtle/35 xl:hidden">
        <Container className="py-2.5 sm:py-3">
          <HeaderSearch className="w-full" />
        </Container>
      </div>
    </header>
  );
}
