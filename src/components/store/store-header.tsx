import Link from "next/link";
import { ChevronDown, Menu } from "lucide-react";
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

/**
 * Storefront header (PHASE-05 task 1, extended by PHASE-06): real category
 * navigation from the database — desktop shows the five departments inline,
 * phone/tablet get the full tree (with children) in a slide-over, and search
 * lives inline on desktop plus as an always-visible row on small screens
 * (task 5). Cart drawer + guest wishlist drawer (PHASE-06) are the live
 * header actions with persistent count badges.
 */
export async function StoreHeader() {
  const tree = await getStorefrontCategoryTree();

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background">
      <Container className="flex h-[3.75rem] items-center justify-between gap-2 xl:h-[4.5rem] xl:gap-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <Sheet>
            <SheetTrigger
              data-slot="button"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-11 shrink-0 rounded-full xl:hidden"
              )}
              aria-label="فتح قائمة الأقسام"
            >
              <Menu aria-hidden className="size-5" />
            </SheetTrigger>
            <SheetContent side="right" className="flex w-80 flex-col">
              <SheetHeader className="text-start">
                <SheetTitle>أقسام المتجر</SheetTitle>
                <SheetDescription>تصفّحي كل أقسام أميرة استور</SheetDescription>
              </SheetHeader>
              <nav aria-label="تنقل الجوال" className="flex-1 overflow-y-auto px-4 pb-8">
                <ul className="flex flex-col gap-1">
                  <li>
                    <Link
                      href="/"
                      className="block rounded-lg px-3 py-2.5 text-sm font-bold transition-colors hover:bg-blush/60 focus-visible:bg-blush/60"
                    >
                      الرئيسية
                    </Link>
                  </li>
                  {tree.map((department) => (
                    <li key={department.id}>
                      <Link
                        href={`/category/${encodeURIComponent(department.slug)}`}
                        className="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors hover:bg-blush/60 focus-visible:bg-blush/60"
                      >
                        <span>{department.name}</span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {department.productCount > 0
                            ? itemCountPhrase(department.productCount)
                            : "لا توجد منتجات بعد"}
                        </span>
                      </Link>
                      {department.children.length > 0 ? (
                        <ul className="mt-1 flex flex-col gap-0.5 border-s border-border/70 ps-3 ms-3">
                          {department.children.map((child) => (
                            <li key={child.id}>
                              <Link
                                href={`/category/${encodeURIComponent(child.slug)}`}
                                className="block rounded-lg px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-blush/60 focus-visible:bg-blush/60"
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
            className="min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <BrandLogo
              showEnglishWordmark
              className="gap-1.5 sm:gap-2"
              markClassName="size-9 sm:size-10 xl:size-12"
              logoClassName="h-9 max-w-9 sm:h-10 sm:max-w-10 xl:h-12 xl:max-w-12"
              wordmarkClassName="text-base sm:text-lg xl:text-xl"
              englishWordmarkClassName="text-[0.6rem] sm:text-[0.625rem]"
            />
          </Link>
        </div>

        <nav aria-label="أقسام المتجر" className="hidden shrink-0 xl:block">
          <ul className="flex items-center gap-0">
            {tree.map((department) => (
              <li key={department.id}>
                <Link
                  href={`/category/${encodeURIComponent(department.slug)}`}
                  className="flex items-center gap-1 rounded-full px-2 py-2 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-blush/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring 2xl:px-2.5 2xl:text-sm"
                >
                  {department.name}
                  {department.children.length > 0 ? (
                    <ChevronDown aria-hidden className="size-3.5 opacity-60" />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1 xl:gap-1.5">
          <HeaderSearch className="hidden w-44 xl:block 2xl:w-52" />
          <WishlistDrawer />
          <CartDrawer />
        </div>
      </Container>

      <div className="border-t border-border/70 bg-surface-subtle/35 xl:hidden">
        <Container className="py-2 sm:py-2.5">
          <HeaderSearch className="w-full" />
        </Container>
      </div>
    </header>
  );
}
