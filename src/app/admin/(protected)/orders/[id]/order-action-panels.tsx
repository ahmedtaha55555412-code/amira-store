'use client';

/**
 * Order detail action panels (PHASE-08 tasks 4–8 UI).
 * Each panel POSTs to the corresponding admin API, shows the honest Arabic
 * error surfaced by the service, and refreshes the server-rendered detail.
 * Transition options arrive pre-computed from the validated transition maps —
 * the UI can never offer an unsanctioned edge.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Ban, CheckCircle2, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function postOrderAction(
  orderId: string,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/admin/orders/${orderId}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      return { ok: false, error: payload.error ?? 'تعذّر تنفيذ الإجراء. حاول مرة أخرى.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'تعذّر الاتصال بالخادم. حاول مرة أخرى.' };
  }
}

function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Order status transitions                                                    */
/* -------------------------------------------------------------------------- */

export function OrderStatusActions({
  orderId,
  current,
  allowed,
  labels,
}: {
  orderId: string;
  current: string;
  allowed: string[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(target: string) {
    setPending(target);
    setError(null);
    const result = await postOrderAction(orderId, 'status', { status: target });
    if (!result.ok) {
      setError(result.error ?? null);
      setPending(null);
      return;
    }
    setPending(null);
    router.refresh();
  }

  const forward = allowed.filter((status) => status !== 'canceled');
  const canCancel = allowed.includes('canceled');

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {forward.map((status) => (
          <Button
            key={status}
            size="sm"
            disabled={pending !== null}
            onClick={() => run(status)}
            className="gap-1.5 rounded-full"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {pending === status ? 'جارٍ التنفيذ…' : `الانتقال إلى: ${labels[status]}`}
          </Button>
        ))}
        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => {
              if (window.confirm('هل تريد إلغاء الطلب؟ سيُعاد المخزون مرة واحدة فقط ويُسجَّل في سجل الحركات.')) {
                run('canceled');
              }
            }}
            className="gap-1.5 rounded-full text-destructive hover:text-destructive"
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
            {pending === 'canceled' ? 'جارٍ الإلغاء…' : 'إلغاء الطلب'}
          </Button>
        )}
        {forward.length === 0 && !canCancel && (
          <p className="text-xs text-muted-foreground">لا توجد انتقالات متاحة — الحالة نهائية.</p>
        )}
      </div>
      <ActionError message={error} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shipping status transitions                                                 */
/* -------------------------------------------------------------------------- */

export function ShippingStatusActions({
  orderId,
  current,
  allowed,
  labels,
}: {
  orderId: string;
  current: string;
  allowed: string[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(target: string) {
    setPending(target);
    setError(null);
    const result = await postOrderAction(orderId, 'shipping-status', { status: target });
    if (!result.ok) {
      setError(result.error ?? null);
      setPending(null);
      return;
    }
    setPending(null);
    router.refresh();
  }

  if (allowed.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {current === 'delivered'
          ? 'تم التسليم — حالة الشحن نهائية.'
          : 'أُعيدت الأصناف للمخزون — حالة الشحن نهائية.'}
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {allowed.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={status === 'delivery_failed' ? 'outline' : 'default'}
            disabled={pending !== null}
            onClick={() => {
              if (status === 'returned_to_stock') {
                if (
                  window.confirm(
                    'سيُعاد مخزون جميع بنود الطلب مرة واحدة فقط، ويُلغى الطلب إن كان قائمًا. متابعة؟',
                  )
                ) {
                  run(status);
                }
                return;
              }
              run(status);
            }}
            className="gap-1.5 rounded-full"
          >
            <Truck className="h-4 w-4" aria-hidden="true" />
            {pending === status ? 'جارٍ التنفيذ…' : labels[status]}
          </Button>
        ))}
      </div>
      <ActionError message={error} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Payment status (COD collection)                                             */
/* -------------------------------------------------------------------------- */

export function PaymentStatusActions({
  orderId,
  allowed,
  labels,
}: {
  orderId: string;
  allowed: string[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(target: string) {
    setPending(target);
    setError(null);
    const result = await postOrderAction(orderId, 'payment-status', { status: target });
    if (!result.ok) {
      setError(result.error ?? null);
      setPending(null);
      return;
    }
    setPending(null);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {allowed.map((status) => (
          <Button
            key={status}
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => run(status)}
            className="rounded-full"
          >
            {pending === status ? 'جارٍ التنفيذ…' : labels[status]}
          </Button>
        ))}
        {allowed.length === 0 && (
          <p className="text-xs text-muted-foreground">لا توجد انتقالات متاحة لحالة التحصيل الحالية.</p>
        )}
      </div>
      <ActionError message={error} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shipping cost entry (§11 — after WhatsApp confirmation)                     */
/* -------------------------------------------------------------------------- */

export function ShippingCostForm({
  orderId,
  currentCost,
}: {
  orderId: string;
  currentCost: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentCost ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      setError('أدخل تكلفة شحن صحيحة.');
      return;
    }
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await postOrderAction(orderId, 'shipping-cost', { shippingCost: numeric });
    if (!result.ok) {
      setError(result.error ?? null);
      setPending(false);
      return;
    }
    setSaved(true);
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="shipping-cost-input" className="text-xs text-muted-foreground">
            تكلفة الشحن (ج.م.) — تُدخل بعد تأكيدها عبر واتساب
          </Label>
          <Input
            id="shipping-cost-input"
            dir="ltr"
            inputMode="decimal"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            placeholder={currentCost ?? '0.00'}
            className="h-9 w-36"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending} className="rounded-full">
          {pending ? 'جارٍ الحفظ…' : 'حفظ التكلفة'}
        </Button>
      </div>
      {saved && (
        <p role="status" className="text-xs font-medium text-success">
          تم الحفظ وأُعيد حساب الإجمالي على الخادم.
        </p>
      )}
      <ActionError message={error} />
    </form>
  );
}
