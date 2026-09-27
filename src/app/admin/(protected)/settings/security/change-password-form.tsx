'use client';

/**
 * Change-password form (PHASE-03 task 9).
 * current password + new password + confirmation; on success the API revokes
 * all sessions and the user is routed to the login page (documented policy).
 */

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FieldKey = 'current' | 'next' | 'confirm';

export function ChangePasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [visible, setVisible] = useState<Record<FieldKey, boolean>>({
    current: false,
    next: false,
    confirm: false,
  });

  function toggleVisible(key: FieldKey) {
    setVisible((state) => ({ ...state, [key]: !state[key] }));
  }

  function passwordInput(
    id: FieldKey,
    label: string,
    autoComplete: string,
  ) {
    return (
      <div className="space-y-2">
        <Label htmlFor={`pw-${id}`}>{label}</Label>
        <div className="relative">
          <Input
            id={`pw-${id}`}
            name={id}
            type={visible[id] ? 'text' : 'password'}
            autoComplete={autoComplete}
            dir="ltr"
            required
            maxLength={200}
            disabled={pending}
            className="h-11 pe-11"
          />
          <button
            type="button"
            onClick={() => toggleVisible(id)}
            aria-label={visible[id] ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            className="absolute inset-y-0 end-0 flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            {visible[id] ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/admin/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: String(form.get('current') ?? ''),
          newPassword: String(form.get('next') ?? ''),
          confirmNewPassword: String(form.get('confirm') ?? ''),
        }),
      });
      const data: { ok?: boolean; error?: string } = await response
        .json()
        .catch(() => ({}));

      if (response.ok && data.ok) {
        setSuccess(true);
        // Policy: all sessions revoked — return to the login page.
        setTimeout(() => {
          router.replace('/admin/login');
          router.refresh();
        }, 1500);
        return;
      }

      setError(data.error ?? 'تعذر تغيير كلمة المرور. حاول مرة أخرى.');
    } catch {
      setError('تعذر الاتصال بالخادم. تحقق من الشبكة وحاول مرة أخرى.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-success/40 bg-success/10 p-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>تم تغيير كلمة المرور. سيتم الآن تحويلك إلى صفحة تسجيل الدخول…</p>
        </div>
      ) : null}

      {passwordInput('current', 'كلمة المرور الحالية', 'current-password')}
      {passwordInput('next', 'كلمة المرور الجديدة', 'new-password')}
      {passwordInput('confirm', 'تأكيد كلمة المرور الجديدة', 'new-password')}

      <Button type="submit" disabled={pending} className="h-11 w-full gap-2 text-base font-semibold">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            جارٍ الحفظ…
          </>
        ) : (
          'حفظ كلمة المرور الجديدة'
        )}
      </Button>
    </form>
  );
}
