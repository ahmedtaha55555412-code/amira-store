import { Skeleton } from "@/components/ui/skeleton";
import { Container } from "@/components/store/container";

/** Category listing loading state (PHASE-05 UX states) — skeleton mirrors the layout. */
export default function CategoryLoading() {
  return (
    <>
      <div className="border-b border-border/70 bg-surface-subtle/40">
        <Container className="py-4">
          <Skeleton className="h-5 w-64" />
        </Container>
      </div>
      <main className="flex-1">
        <Container className="py-8 sm:py-10">
          <Skeleton className="mb-2 h-9 w-56" />
          <Skeleton className="mb-8 h-5 w-24" />
          <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="hidden flex-col gap-6 lg:flex" aria-hidden>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex flex-col gap-2.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-2xl border bg-surface">
                  <Skeleton className="aspect-[4/5] rounded-none" />
                  <div className="flex flex-col gap-2 p-4">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </main>
    </>
  );
}
