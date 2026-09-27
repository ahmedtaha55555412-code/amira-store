import { Skeleton } from "@/components/ui/skeleton";
import { Container } from "@/components/store/container";

/** Search page loading state (PHASE-05 UX states). */
export default function SearchLoading() {
  return (
    <>
      <div className="border-b border-border/70 bg-surface-subtle/40">
        <Container className="py-4">
          <Skeleton className="h-5 w-40" />
        </Container>
      </div>
      <main className="flex-1">
        <Container className="py-8 sm:py-10">
          <Skeleton className="mb-2 h-9 w-72" />
          <Skeleton className="mb-8 h-5 w-24" />
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
        </Container>
      </main>
    </>
  );
}
