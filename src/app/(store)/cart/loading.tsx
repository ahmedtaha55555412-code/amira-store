import { Container } from "@/components/store/container";
import { Section } from "@/components/store/section";

/** Route-consistent loading shell (matches the other (store) routes). */
export default function CartLoading() {
  return (
    <Section className="py-8 sm:py-10">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-surface-subtle" />
          <div className="h-4 w-64 animate-pulse rounded bg-surface-subtle" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-8">
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex gap-3 rounded-2xl border bg-surface p-3">
                <div className="size-20 shrink-0 animate-pulse rounded-xl bg-surface-subtle sm:size-24" />
                <div className="flex flex-1 flex-col gap-2 py-1">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-surface-subtle" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-surface-subtle" />
                  <div className="mt-auto h-8 w-32 animate-pulse rounded-full bg-surface-subtle" />
                </div>
              </div>
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl border bg-surface-subtle/60" />
        </div>
      </Container>
    </Section>
  );
}
