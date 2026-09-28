import { Skeleton } from "@/components/ui/skeleton";
import { Container } from "@/components/store/container";

/**
 * Product detail skeleton (PHASE-05 UX states) — the exact markup of the
 * former route-level `loading.tsx`, now co-located and used as the in-page
 * Suspense fallback (ISSUE-045): the page commits a real 404 for missing
 * slugs pre-flush while valid resources keep the identical loading UX.
 */
export function ProductSkeleton() {
  return (
    <>
      <div className="border-b border-border/70 bg-surface-subtle/40">
        <Container className="py-4">
          <Skeleton className="h-5 w-72" />
        </Container>
      </div>
      <main className="flex-1">
        <Container className="py-8 sm:py-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] xl:gap-12">
            <div className="flex flex-col gap-3">
              <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
              <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="size-20 rounded-xl" />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4" aria-hidden>
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-9 w-4/5" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-12 w-full rounded-full" />
              <Skeleton className="h-12 w-full rounded-full" />
            </div>
          </div>
        </Container>
      </main>
    </>
  );
}
