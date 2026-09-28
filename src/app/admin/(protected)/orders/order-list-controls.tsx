'use client';

/**
 * Order list filter controls (PHASE-08 task 1 UI).
 * Pushes filters into the URL — the server-rendered list stays shareable.
 */

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ORDER_STATUSES = [
  { value: 'new', label: 'جديد' },
  { value: 'under_review', label: 'قيد المراجعة' },
  { value: 'confirmed', label: 'مؤكد' },
  { value: 'preparing', label: 'قيد التجهيز' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'canceled', label: 'ملغى' },
] as const;

const SHIPPING_STATUSES = [
  { value: 'not_started', label: 'لم تبدأ' },
  { value: 'preparing', label: 'قيد التجهيز' },
  { value: 'ready_to_ship', label: 'جاهزة للشحن' },
  { value: 'shipped', label: 'تم الشحن' },
  { value: 'out_for_delivery', label: 'قيد التوصيل' },
  { value: 'delivered', label: 'تم التسليم' },
  { value: 'delivery_failed', label: 'فشل التوصيل' },
  { value: 'returned_to_stock', label: 'أُعيدت للمخزون' },
] as const;

const PAYMENT_STATUSES = [
  { value: 'pending', label: 'بانتظار التحصيل' },
  { value: 'collected', label: 'تم التحصيل' },
  { value: 'failed', label: 'فشل التحصيل' },
] as const;

export function OrderListControls({
  currentStatus,
  currentShippingStatus,
  currentPaymentStatus,
  currentSearch,
}: {
  currentStatus: string;
  currentShippingStatus: string;
  currentPaymentStatus: string;
  currentSearch: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(currentSearch);

  function push(next: {
    status?: string;
    shipping?: string;
    payment?: string;
    q?: string;
  }) {
    const params = new URLSearchParams();
    const status = next.status ?? currentStatus;
    if (status && status !== 'all') params.set('status', status);
    const shipping = next.shipping ?? currentShippingStatus;
    if (shipping && shipping !== 'all') params.set('shipping', shipping);
    const payment = next.payment ?? currentPaymentStatus;
    if (payment && payment !== 'all') params.set('payment', payment);
    const q = next.q !== undefined ? next.q : search;
    if (q) params.set('q', q);
    const query = params.toString();
    router.push(query ? `/admin/orders?${query}` : '/admin/orders');
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    push({ q: search.trim() });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={currentStatus} onValueChange={(value) => push({ status: value })}>
        <SelectTrigger className="w-[160px] rounded-full" aria-label="تصفية بحالة الطلب">
          <SelectValue placeholder="حالة الطلب" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل الحالات</SelectItem>
          {ORDER_STATUSES.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={currentShippingStatus} onValueChange={(value) => push({ shipping: value })}>
        <SelectTrigger className="w-[170px] rounded-full" aria-label="تصفية بحالة الشحن">
          <SelectValue placeholder="حالة الشحن" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل حالات الشحن</SelectItem>
          {SHIPPING_STATUSES.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={currentPaymentStatus} onValueChange={(value) => push({ payment: value })}>
        <SelectTrigger className="w-[170px] rounded-full" aria-label="تصفية بحالة التحصيل">
          <SelectValue placeholder="حالة التحصيل" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل حالات التحصيل</SelectItem>
          {PAYMENT_STATUSES.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <form onSubmit={onSearch} className="ms-auto flex items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="رقم الطلب / الاسم / الهاتف"
          className="h-9 w-56 rounded-full"
          aria-label="بحث في الطلبات"
        />
        <button
          type="submit"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="بحث"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
