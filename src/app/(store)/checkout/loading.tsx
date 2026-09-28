/** Streaming skeleton for the checkout page (mirrors the cart's shape). */
export default function CheckoutLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-start lg:gap-8" aria-busy="true" aria-label="جارٍ تحميل صفحة إتمام الطلب">
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-20 animate-pulse rounded-2xl border bg-surface" />
        ))}
        <div className="h-32 animate-pulse rounded-2xl border bg-surface" />
      </div>
      <div className="h-64 animate-pulse rounded-2xl border bg-surface" />
    </div>
  );
}
