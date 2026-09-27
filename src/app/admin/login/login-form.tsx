'use client';

/**
 * Admin login form (PHASE-03 tasks 2/6 client side).
 * Posts to the login API; surfaces ONLY the server's generic Arabic errors.
 * The `next` query parameter is honored only when it points inside /admin —
 * never as an open redirect.
 */

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Loader2, LogIn, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LoginFormState = 'idle' | 'submitting';

export function LoginForm() {
  const router = useRouter();
  const [state, setState] = useState<LoginFormState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'submitting') return;

    const form = new FormData(event.currentTarget);
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');

    setState('submitting');
    setError(null);
    setRetryAfterSeconds(null);

    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data: { ok?: boolean; error?: string; retryAfterSeconds?: number } =
        await response.json().catch(() => ({}));

      if (response.ok && data.ok) {
        const next = safeNextPath(window.location.search);
        router.replace(next ?? '/admin');
        router.refresh();
        return;
      }

      setError(data.error ?? 'تعذر تسجيل الدخول. حاول مرة أخرى.');
      if (response.status === 429 && typeof data.retryAfterSeconds === 'number') {
        setRetryAfterSeconds(data.retryAfterSeconds);
      }
    } catch {
      setError('تعذر الاتصال بالخادم. تحقق من الشبكة وحاول مرة أخرى.');
    } finally {
      setState('idle');
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
          <div>
            <p>{error}</p>
            {retryAfterSeconds !== null ? (
              <p className="mt-1 text-xs opacity-80">
                ({`المحاولة التالية متاحة بعد ${retryAfterSeconds} ثانية`})
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="admin-username">اسم المستخدم</Label>
        <Input
          id="admin-username"
          name="username"
          type="text"
          autoComplete="username"
          dir="ltr"
          required
          maxLength={200}
          disabled={state === 'submitting'}
          className="h-11"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-password">كلمة المرور</Label>
        <div className="relative">
          <Input
            id="admin-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            dir="ltr"
            required
            maxLength={200}
            disabled={state === 'submitting'}
            className="h-11 pe-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            className="absolute inset-y-0 end-0 flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        disabled={state === 'submitting'}
        className="h-11 w-full gap-2 text-base font-semibold"
      >
        {state === 'submitting' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            جارٍ التحقق…
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" aria-hidden="true" />
            تسجيل الدخول
          </>
        )}
      </Button>
    </form>
  );
}

/** Allow only in-app admin destinations; anything else falls back to /admin. */
function safeNextPath(search: string): string | null {
  const next = new URLSearchParams(search).get('next');
  if (!next) return null;
  if (!next.startsWith('/admin')) return null;
  if (next.startsWith('/admin/login')) return null;
  if (next.startsWith('//')) return null;
  return next;
}
