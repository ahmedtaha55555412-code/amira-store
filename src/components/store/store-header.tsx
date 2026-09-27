"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Menu, Search, ShoppingBag, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { BrandLogo } from "@/components/brand/brand-logo";
import { SECTION_NAV } from "@/config/navigation";
import { Container } from "./container";

const SOON_MESSAGE =
  "هذه الميزة قيد التطوير وستُتاح ضمن مراحل المشروع القادمة — لا تُعد وظيفة مكتملة حاليًا.";

export function StoreHeader() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const notifySoon = (feature: string) =>
    toast({ title: `${feature} — قريبًا`, description: SOON_MESSAGE });

  /** Not-yet-active storefront action: clearly labeled, never fakes functionality. */
  const soonAction = (feature: string, Icon: LucideIcon) => (
    <Button
      variant="ghost"
      size="icon"
      aria-disabled="true"
      aria-label={`${feature} — غير مفعّلة حاليًا، قريبًا`}
      onClick={() => notifySoon(feature)}
      className="relative text-muted-foreground hover:bg-blush/60 hover:text-foreground"
    >
      <Icon aria-hidden className="size-5" />
      <span
        aria-hidden
        className="absolute end-1 top-1 size-1.5 rounded-full bg-gold"
      />
    </Button>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <Container className="flex h-16 items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="فتح قائمة التنقل"
              >
                <Menu aria-hidden className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader className="text-start">
                <SheetTitle>القائمة</SheetTitle>
                <SheetDescription className="sr-only">
                  التنقل بين أقسام الصفحة الرئيسية
                </SheetDescription>
              </SheetHeader>
              <nav aria-label="تنقل الجوال" className="mt-2 flex flex-col gap-1 px-4">
                {SECTION_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-blush/60 focus-visible:bg-blush/60"
                  >
                    {item.label}
                  </Link>
                ))}
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

        <nav aria-label="التنقل الرئيسي" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {SECTION_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-full px-3.5 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-blush/60 hover:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {soonAction("البحث", Search)}
          {soonAction("المفضلة", Heart)}
          {soonAction("سلة التسوق", ShoppingBag)}
        </div>
      </Container>
    </header>
  );
}
