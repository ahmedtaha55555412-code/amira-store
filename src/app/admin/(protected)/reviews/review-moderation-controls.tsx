'use client';

/**
 * Review moderation controls (PHASE-09). POSTs to the admin moderate API,
 * shows the honest Arabic error surfaced by the service, and refreshes the
 * server-rendered list. Buttons disable while the action is in flight; a
 * confirm step guards approve (it publishes the review publicly).
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

async function postModeration(
  reviewId: string,
  action: 'approved' | 'rejected',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/admin/reviews/${reviewId}/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
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

export function ReviewModerationControls({
  reviewId,
  status,
}: {
  reviewId: string;
  status: 'pending' | 'approved' | 'rejected';
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'approved' | 'rejected') {
    if (action === 'approved' && status !== 'approved') {
      const confirmed = window.confirm(
        'الاعتماد سينشر هذه المراجعة على صفحة المنتج (وسيُنشر مفتاح صورتها إن وُجدت). هل تريد المتابعة؟',
      );
      if (!confirmed) return;
    }
    setPendingAction(action);
    setError(null);
    const result = await postModeration(reviewId, action);
    if (!result.ok) {
      setError(result.error ?? null);
      setPendingAction(null);
      return;
    }
    router.refresh();
    setPendingAction(null);
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
      <Button
        type="button"
        size="sm"
        disabled={pendingAction !== null || status === 'approved'}
        onClick={() => run('approved')}
        className="min-h-9 gap-1.5 rounded-full"
      >
        {pendingAction === 'approved' ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Check aria-hidden className="size-4" />
        )}
        اعتماد ونشر
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pendingAction !== null || status === 'rejected'}
        onClick={() => run('rejected')}
        className="min-h-9 gap-1.5 rounded-full text-destructive hover:bg-destructive/10"
      >
        {pendingAction === 'rejected' ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <X aria-hidden className="size-4" />
        )}
        رفض
      </Button>
      {status === 'approved' ? (
        <span className="text-xs text-success">منشورة حاليًا على المتجر</span>
      ) : null}
      {status === 'rejected' ? (
        <span className="text-xs text-muted-foreground">مرفوضة — لن تظهر على المتجر</span>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
