'use client';

/**
 * Logout control (PHASE-03 task 5). Posts to the logout API, then leaves the
 * admin area. Session destruction is server-side; the cookie is cleared by
 * the API response regardless.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout() {
    if (pending) return;
    setPending(true);
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      // Network failure must not trap the user in the admin area.
    } finally {
      router.replace('/admin/login');
      router.refresh();
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onLogout}
      disabled={pending}
      className="gap-1.5 rounded-full"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <LogOut className="h-4 w-4" aria-hidden="true" />
      )}
      خروج
    </Button>
  );
}
