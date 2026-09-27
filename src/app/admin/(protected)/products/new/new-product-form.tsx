'use client';

/**
 * New-product form (PHASE-04 task 2 UI): name + slug + category → draft.
 * Server assigns the final unique slug and returns the editor path.
 */

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

export function NewProductForm({
  categories,
}: {
  categories: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          slug: String(form.get('slug') ?? '') || null,
          categoryId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        product?: { id: string };
      };
      if (response.ok && data.ok && data.product) {
        router.push(`/admin/products/${data.product.id}`);
        return;
      }
      toast({
        title: 'تعذر إنشاء المنتج',
        description: data.error ?? 'خطأ غير متوقع.',
        variant: 'destructive',
      });
    } catch {
      toast({
        title: 'تعذر الاتصال بالخادم',
        description: 'تحقق من الشبكة وحاول مرة أخرى.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="product-name">اسم المنتج</Label>
        <Input
          id="product-name"
          name="name"
          required
          minLength={2}
          maxLength={200}
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="product-slug">الرابط (slug) — اختياري</Label>
        <Input id="product-slug" name="slug" dir="ltr" maxLength={120} className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="product-category">القسم</Label>
        <Select value={categoryId} onValueChange={setCategoryId} required>
          <SelectTrigger id="product-category" className="h-11">
            <SelectValue placeholder="اختر القسم" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={busy || !categoryId} className="h-11 w-full gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        إنشاء المسودة والمتابعة للمحرر
      </Button>
    </form>
  );
}
