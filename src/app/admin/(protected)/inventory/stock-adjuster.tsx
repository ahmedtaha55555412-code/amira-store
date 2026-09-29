'use client';

/**
 * Manual stock adjustment dialog (PHASE-12).
 *
 * One signed delta + a MANDATORY admin-typed reason per adjustment. The
 * client enforces nothing security-critical — the server re-validates
 * everything (zod + transaction + no-negative + ledger row + audit).
 * Empty/zero-delta/missing-reason submissions are refused client-side only
 * for instant feedback; the server is the authority.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

export function StockAdjustButton({
  variantId,
  sku,
  productName,
  stockQuantity,
}: {
  variantId: string;
  sku: string;
  productName: string;
  stockQuantity: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');

  function reset() {
    setDelta('');
    setReason('');
  }

  async function submit() {
    const parsed = Number(delta);
    if (!Number.isInteger(parsed) || parsed === 0) {
      toast({
        title: 'أدخل كمية صحيحة غير صفرية (+ إضافة / − خصم).',
        variant: 'destructive',
      });
      return;
    }
    if (reason.trim().length < 3) {
      toast({ title: 'سبب التعديل مطلوب (٣ أحرف على الأقل).', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId,
          quantityDelta: parsed,
          reason: reason.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        stockAfter?: number;
      };
      if (!response.ok) {
        toast({ title: data.error ?? 'تعذر تنفيذ التعديل.', variant: 'destructive' });
        return;
      }
      toast({
        title: `تم التعديل — الكمية الآن: ${data.stockAfter ?? '?'}`,
        description: 'سُجّل التعديل في سجل الحركات مع السبب.',
      });
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 rounded-full gap-1.5"
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
        aria-label={`تعديل مخزون ${productName}`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        تعديل
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل مخزون يدوي</DialogTitle>
            <DialogDescription>
              يُسجَّل كل تعديل في سجل الحركات (قبل ← بعد) مع السبب واسم المشرف.
              السبب إلزامي، ولا يمكن جعل الكمية سالبة.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-xl border bg-surface-subtle/50 p-3 text-sm">
              <p className="font-semibold text-foreground">{productName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                {sku}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                الكمية الحالية:{' '}
                <span className="font-bold text-foreground">{stockQuantity}</span>
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-delta">
                الكمية (موجب = إضافة، سالب = خصم)
              </Label>
              <Input
                id="adjust-delta"
                dir="ltr"
                inputMode="numeric"
                placeholder="مثال: 5 أو -3"
                value={delta}
                onChange={(event) => setDelta(event.target.value)}
                className="h-11"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-reason">سبب التعديل (إلزامي)</Label>
              <Textarea
                id="adjust-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={300}
                placeholder="مثال: جرد فعلي — تلف في المخزن"
                className="resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                يظهر السبب في سجل حركات المتغير وفي سجل النشاط.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              حفظ التعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
