'use client';

/**
 * Per-row product status quick action (PHASE-12): draft ⇄ active ⇄ archived
 * from the products list, through the EXISTING audited status route
 * (POST /api/admin/products/[id]/status) — no new mutation surface, the
 * server transition rules + audit stay the single authority.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type ProductStatus = 'draft' | 'active' | 'archived';

const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: 'مسودة',
  active: 'نشط',
  archived: 'مؤرشف',
};

export function ProductStatusAction({
  productId,
  productName,
  status,
}: {
  productId: string;
  productName: string;
  status: ProductStatus;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState<ProductStatus>(status);

  async function change(next: ProductStatus) {
    if (next === value || busy) return;
    const previous = value;
    setBusy(true);
    setValue(next); // optimistic
    try {
      const response = await fetch(`/api/admin/products/${productId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setValue(previous); // revert
        toast({ title: data.error ?? 'تعذر تغيير حالة المنتج.', variant: 'destructive' });
        return;
      }
      toast({ title: `حالة «${productName}»: ${STATUS_LABEL[next]}` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={value}
        onValueChange={(next) => void change(next as ProductStatus)}
        disabled={busy}
      >
        <SelectTrigger
          aria-label={`حالة المنتج ${productName}`}
          className="h-9 w-[7.5rem] rounded-full text-xs"
        >
          <SelectValue />
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABEL) as ProductStatus[]).map((option) => (
            <SelectItem key={option} value={option} className="text-xs">
              {STATUS_LABEL[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
