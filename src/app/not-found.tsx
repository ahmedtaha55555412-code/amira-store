import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/store/container";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getBrandSettings } from "@/lib/branding";

/**
 * Arabic 404 (PHASE-05 UX states): unknown category/product slugs land here.
 * Avoids loading the category tree; the shared brand resolver supplies the
 * same store identity used by the storefront.
 */
export default async function NotFound() {
  const { storeName } = await getBrandSettings();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/70">
        <Container className="flex h-16 items-center">
          <Link
            href="/"
            aria-label={`${storeName} — الصفحة الرئيسية`}
            className="rounded-lg transition-opacity hover:opacity-80"
          >
            <BrandLogo storeName={storeName} showArabicWordmark showEnglishWordmark />
          </Link>
        </Container>
      </header>

      <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center outline-none">
        <Container className="flex flex-col items-center gap-4 py-20 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-blush text-primary">
            <Compass aria-hidden className="size-8" />
          </span>
          <h1 className="text-2xl font-bold sm:text-3xl">الصفحة غير موجودة</h1>
          <p className="max-w-md text-sm leading-loose text-muted-foreground">
            الرابط الذي طلبته غير متاح — ربما تم نقل المنتج أو تغيّر القسم.
            تفضّلي بالعودة للرئيسية أو تصفّحي الأقسام من القائمة.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild className="rounded-full">
              <Link href="/">الصفحة الرئيسية</Link>
            </Button>
          </div>
        </Container>
      </main>

      <footer className="border-t border-border/70 py-6 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} {storeName} — جميع الحقوق محفوظة.</p>
      </footer>
    </div>
  );
}
