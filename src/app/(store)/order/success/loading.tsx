/** Streaming skeleton for the order-success page. */
export default function OrderSuccessLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="h-28 animate-pulse rounded-2xl border bg-surface" />
      <div className="h-48 animate-pulse rounded-2xl border bg-surface" />
      <div className="h-24 animate-pulse rounded-2xl border bg-surface" />
    </div>
  );
}
