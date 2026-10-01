import Link from "next/link";
import { ChevronDown, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <Container className="flex h-16 items-center justify-between gap-2 lg:gap-4">
        <div className="flex items-center gap-1">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 lg:hidden"
                aria-label="فتح قائمة الأقسام"
              >
                <Menu aria-hidden className="size-5" />
              </Button>
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
                            : "قريبًا"}
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
            className="rounded-lg transition-opacity hover:opacity-80"
          >
            <BrandLogo />
          </Link>
        </div>

        <nav aria-label="أقسام المتجر" className="hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {tree.map((department) => (
              <li key={department.id}>
                <Link
                  href={`/category/${encodeURIComponent(department.slug)}`}
                  className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-blush/60 hover:text-foreground"
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

        <div className="flex items-center gap-0.5 sm:gap-1">
          <HeaderSearch className="hidden w-48 lg:block xl:w-64" />
          <WishlistDrawer />
          <CartDrawer />
        </div>
      </Container>

      {/* Phone/tablet search row — always visible, no extra tap needed */}
      <div className="border-t border-border/70 bg-background/95 lg:hidden">
        <Container className="py-2">
          <HeaderSearch />
        </Container>
      </div>
    </header>
  );
}
