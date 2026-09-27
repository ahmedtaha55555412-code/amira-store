import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  pageCount: number;
  /** URL builder for a target page (preserves query/filters). */
  buildHref: (page: number) => string;
};

/** Numbered server-rendered pagination with RTL-correct chevrons. */
export function Pagination({ page, pageCount, buildHref }: PaginationProps) {
  if (pageCount <= 1) return null;

  const pages: Array<number | "ellipsis"> = [];
  const window = 2;
  for (let i = 1; i <= pageCount; i += 1) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= window) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "ellipsis") {
      pages.push("ellipsis");
    }
  }

  const linkClass =
    "flex size-9 items-center justify-center rounded-full border border-border text-sm font-medium transition-colors hover:bg-blush/60 hover:text-foreground";

  return (
    <nav aria-label="تنقل بين صفحات النتائج" className="mt-8 flex items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={buildHref(page - 1)} className={cn(linkClass, "size-auto gap-1 px-3")} scroll={false}>
          <ChevronRight aria-hidden className="size-4" />
          السابق
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="flex size-auto cursor-not-allowed items-center gap-1 rounded-full border border-border/60 px-3 py-2 text-sm text-muted-foreground/50"
        >
          <ChevronRight aria-hidden className="size-4" />
          السابق
        </span>
      )}

      <ul className="flex items-center gap-1.5">
        {pages.map((item, index) =>
          item === "ellipsis" ? (
            <li key={`ellipsis-${index}`} aria-hidden className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span
                  aria-current="page"
                  className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                >
                  {item}
                </span>
              ) : (
                <Link href={buildHref(item)} className={linkClass} scroll={false}>
                  {item}
                </Link>
              )}
            </li>
          ),
        )}
      </ul>

      {page < pageCount ? (
        <Link href={buildHref(page + 1)} className={cn(linkClass, "size-auto gap-1 px-3")} scroll={false}>
          التالي
          <ChevronLeft aria-hidden className="size-4" />
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="flex size-auto cursor-not-allowed items-center gap-1 rounded-full border border-border/60 px-3 py-2 text-sm text-muted-foreground/50"
        >
          التالي
          <ChevronLeft aria-hidden className="size-4" />
        </span>
      )}
    </nav>
  );
}
