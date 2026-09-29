'use client';

/**
 * Admin route-level error boundary (PHASE-12): honest Arabic error state with
 * a retry affordance for every protected admin page — no dead-end screens.
 * Error details are never rendered (server internals must not leak).
 */

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side telemetry only: the error class + digest, never message
    // payloads that could carry server internals.
    console.error('[admin-page] render error', error.name, error.digest ?? '');
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-8 text-center"
    >
      <p className="text-lg font-bold text-foreground">
        تعذر عرض هذه الصفحة
      </p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        حدث خطأ غير متوقع أثناء تحميل البيانات. يمكنك إعادة المحاولة — وإذا تكرر
        الخطأ، تحقق من اتصال قاعدة البيانات وحالتك السابقة قبل المتابعة.
      </p>
      <Button onClick={reset} className="min-h-11 rounded-full px-6">
        إعادة المحاولة
      </Button>
    </div>
  );
}
