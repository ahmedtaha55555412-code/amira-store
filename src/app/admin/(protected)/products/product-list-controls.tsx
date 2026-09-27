'use client';

/**
 * Product list filter controls (PHASE-04 task 2 UI).
 * Pushes filters into the URL (server-rendered list stays shareable).
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

export function ProductListControls({
  categories,
  currentStatus,
  currentCategoryId,
  currentSearch,
}: {
  categories: Array<{ id: string; label: string }>;
  currentStatus: 'draft' | 'active' | 'archived' | 'all';
  currentCategoryId: string | null;
  currentSearch: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(currentSearch ?? '');

  function push(next: { status?: string; category?: string | null; q?: string }) {
    const params = new URLSearchParams();
    const status = next.status ?? currentStatus;
    if (status && status !== 'all') params.set('status', status);
    const category = next.category !== undefined ? next.category : currentCategoryId;
    if (category) params.set('category', category);
    const q = next.q !== undefined ? next.q : search;
    if (q) params.set('q', q);
    const query = params.toString();
    router.push(query ? `/admin/products?${query}` : '/admin/products');
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    push({ q: search.trim() });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
      <form onSubmit={onSearch} className="flex min-w-52 flex-1 items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث بالاسم أو الرابط…"
          aria-label="بحث في المنتجات"
          className="h-10"
        />
        <button
          type="submit"
          aria-label="بحث"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background text-muted-foreground transition-colors hover:bg-muted"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      <Select value={currentStatus} onValueChange={(value) => push({ status: value })}>
        <SelectTrigger className="h-10 w-36" aria-label="تصفية الحالة">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل الحالات</SelectItem>
          <SelectItem value="draft">مسودة</SelectItem>
          <SelectItem value="active">نشط</SelectItem>
          <SelectItem value="archived">مؤرشف</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={currentCategoryId ?? 'all'}
        onValueChange={(value) => push({ category: value === 'all' ? null : value })}
      >
        <SelectTrigger className="h-10 w-52" aria-label="تصفية القسم">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="all">كل الأقسام</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
