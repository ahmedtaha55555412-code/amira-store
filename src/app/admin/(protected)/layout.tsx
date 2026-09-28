import type { Metadata } from 'next';
import Link from 'next/link';
import { Boxes, ClipboardList, KeyRound, Images, Package, Warehouse } from 'lucide-react';

import { BrandLogo } from '@/components/brand/brand-logo';
import { Button } from '@/components/ui/button';
import { requireAdminPage } from '@/lib/auth/guard';

import { LogoutButton } from './logout-button';

/**
 * Authenticated admin shell (PHASE-03 + PHASE-04 navigation).
 * `requireAdminPage()` re-validates the session against the database on every
 * request — middleware cookie-presence is never the authorization decision.
 */

export const metadata: Metadata = {
  title: {
    default: 'لوحة التحكم',
    template: '%s | لوحة تحكم أميرة استور',
  },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { admin } = await requireAdminPage();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/admin"
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <BrandLogo markClassName="h-9 w-9" wordmarkClassName="text-lg" />
          </Link>
          <span className="hidden rounded-full bg-blush px-3 py-1 text-xs font-semibold text-secondary-foreground sm:inline">
            لوحة التحكم
          </span>

          <div className="ms-auto flex items-center gap-2">
            <span
              className="hidden rounded-full border bg-surface-subtle px-3 py-1.5 text-xs font-medium text-foreground-muted sm:inline"
              dir="ltr"
            >
              {admin.username}
            </span>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
            >
              <Link href="/admin/products">
                <Package className="h-4 w-4" aria-hidden="true" />
                المنتجات
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
            >
              <Link href="/admin/categories">
                <Boxes className="h-4 w-4" aria-hidden="true" />
                الأصناف
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
            >
              <Link href="/admin/orders">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                الطلبات
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
            >
              <Link href="/admin/inventory">
                <Warehouse className="h-4 w-4" aria-hidden="true" />
                المخزون
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="hidden gap-1.5 rounded-full sm:inline-flex"
            >
              <Link href="/admin/media">
                <Images className="h-4 w-4" aria-hidden="true" />
                الوسائط
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
            >
              <Link href="/admin/settings/security">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                الأمان
              </Link>
            </Button>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6"
      >
        {children}
      </main>

      <footer className="mt-auto border-t bg-card">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
          أميرة استور — لوحة التحكم · منطقة خاصة غير مخصصة للفهرسة
        </div>
      </footer>
    </div>
  );
}
