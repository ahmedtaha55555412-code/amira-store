'use client';

/**
 * Category manager client (PHASE-04 task 1 UI).
 * Tree display + create/edit/delete + sibling reordering. All mutations go
 * through the same-origin admin APIs; the server re-validates everything.
 */

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import { AssetImage } from '@/components/admin/asset-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

export type ManagerCategory = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  children: ManagerCategory[];
};

type DialogState =
  | { mode: 'closed' }
  | { mode: 'create'; parentId: string | null }
  | { mode: 'edit'; category: ManagerCategory };

export function CategoryManager({ initialTree }: { initialTree: ManagerCategory[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const flatOrder = useMemo(() => flatten(initialTree), [initialTree]);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function api(path: string, init: RequestInit): Promise<boolean> {
    const response = await fetch(path, init);
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      toast({ title: 'تعذر التنفيذ', description: data.error ?? 'خطأ غير متوقع.', variant: 'destructive' });
      return false;
    }
    return true;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || dialog.mode === 'closed') return;
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') ?? ''),
      slug: String(form.get('slug') ?? '') || null,
      description: String(form.get('description') ?? '') || null,
      sortOrder: Number(form.get('sortOrder') ?? 0) || 0,
      isActive: form.get('isActive') === 'on',
      parentId:
        dialog.mode === 'create'
          ? dialog.parentId
          : dialog.category.parentId,
    };

    setBusy(true);
    const ok =
      dialog.mode === 'create'
        ? await api('/api/admin/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await api(`/api/admin/categories/${dialog.category.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
    setBusy(false);
    if (ok) {
      toast({ title: dialog.mode === 'create' ? 'تم إنشاء القسم' : 'تم تحديث القسم' });
      setDialog({ mode: 'closed' });
      router.refresh();
    }
  }

  async function onDelete(id: string) {
    if (busy) return;
    setBusy(true);
    const ok = await api(`/api/admin/categories/${id}`, { method: 'DELETE' });
    setBusy(false);
    setDeletingId(null);
    if (ok) {
      toast({ title: 'تم حذف القسم' });
      router.refresh();
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const ids = [...flatOrder];
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    const ok = await api('/api/admin/categories/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: ids }),
    });
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          عدد الأقسام: <span className="font-semibold">{flatOrder.length}</span>
        </p>
        <Button onClick={() => setDialog({ mode: 'create', parentId: null })} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          قسم رئيسي جديد
        </Button>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        {initialTree.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            لا توجد أقسام بعد — ابدأ بإضافة قسم رئيسي.
          </p>
        ) : (
          <ul className="space-y-1">
            {initialTree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                collapsed={collapsed}
                toggle={toggle}
                busy={busy}
                onEdit={(category) => setDialog({ mode: 'edit', category })}
                onAddChild={(parentId) => setDialog({ mode: 'create', parentId })}
                onDelete={(id) => setDeletingId(id)}
                onMove={move}
              />
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={dialog.mode !== 'closed'}
        onOpenChange={(open) => !open && setDialog({ mode: 'closed' })}
      >
        <DialogContent className="sm:max-w-lg">
          {dialog.mode === 'create' ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialog.parentId ? 'إضافة قسم فرعي' : 'إضافة قسم رئيسي'}
                </DialogTitle>
                <DialogDescription>
                  سيولَّد الرابط (slug) تلقائيًا من الاسم إن تُرك فارغًا.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <CategoryFormFields />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialog({ mode: 'closed' })}>
                    إلغاء
                  </Button>
                  <Button type="submit" disabled={busy} className="gap-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    إنشاء
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : dialog.mode === 'edit' ? (
            <>
              <DialogHeader>
                <DialogTitle>تعديل القسم</DialogTitle>
                <DialogDescription>
                  تعديل الاسم/الوصف/الترتيب. لنقل القسم تحت أب آخر استخدم أزرار
                  الإضافة داخل الشجرة.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <CategoryFormFields category={dialog.category} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialog({ mode: 'closed' })}>
                    إلغاء
                  </Button>
                  <Button type="submit" disabled={busy} className="gap-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    حفظ
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد حذف القسم</DialogTitle>
            <DialogDescription>
              الحذف نهائي ولا يمكن التراجع عنه. سيُرفض إن كان القسم يحتوي
              أقسامًا فرعية أو منتجات.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => deletingId && onDelete(deletingId)}
              className="gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryFormFields({ category }: { category?: ManagerCategory }) {
  const [active, setActive] = useState(category?.isActive ?? true);
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="category-name">اسم القسم</Label>
        <Input
          id="category-name"
          name="name"
          defaultValue={category?.name ?? ''}
          required
          minLength={2}
          maxLength={120}
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category-slug">الرابط (slug) — اختياري</Label>
        <Input
          id="category-slug"
          name="slug"
          dir="ltr"
          defaultValue={category?.slug ?? ''}
          maxLength={120}
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category-description">وصف مختصر — اختياري</Label>
        <Textarea
          id="category-description"
          name="description"
          defaultValue={category?.description ?? ''}
          rows={3}
          maxLength={1000}
        />
      </div>
      <div className="grid grid-cols-2 items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="category-sort">ترتيب العرض</Label>
          <Input
            id="category-sort"
            name="sortOrder"
            type="number"
            min={0}
            max={9999}
            defaultValue={category?.sortOrder ?? 0}
            className="h-11"
          />
        </div>
        <div className="flex h-11 items-center justify-between gap-2 rounded-xl border px-3">
          <Label htmlFor="category-active" className="text-sm">
            مفعّل
          </Label>
          {/* Radix Switch is not a form field — mirror it into a hidden input. */}
          <input type="hidden" name="isActive" value={active ? 'on' : 'off'} />
          <Switch
            id="category-active"
            checked={active}
            onCheckedChange={setActive}
            aria-label="تفعيل القسم"
          />
        </div>
      </div>
    </>
  );
}

function TreeNode({
  node,
  depth,
  collapsed,
  toggle,
  busy,
  onEdit,
  onAddChild,
  onDelete,
  onMove,
}: {
  node: ManagerCategory;
  depth: number;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  busy: boolean;
  onEdit: (category: ManagerCategory) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const isCollapsed = collapsed.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border bg-background px-3 py-2"
        style={{ marginInlineStart: `${depth * 20}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && toggle(node.id)}
          aria-label={hasChildren ? (isCollapsed ? 'توسيع' : 'طي') : undefined}
          className={`flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors ${hasChildren ? 'hover:bg-muted' : 'opacity-0'}`}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isCollapsed ? (
              <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )
          ) : (
            <FolderTree className="h-4 w-4 opacity-40" aria-hidden="true" />
          )}
        </button>

        <span className="text-sm font-semibold text-foreground">{node.name}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline" dir="ltr">
          /{node.slug}
        </span>
        {node.isActive ? (
          <Badge variant="outline" className="border-success/40 text-success">
            مفعّل
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            معطّل
          </Badge>
        )}

        <div className="ms-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="تحريك للأعلى"
            disabled={busy}
            onClick={() => onMove(node.id, -1)}
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="تحريك للأسفل"
            disabled={busy}
            onClick={() => onMove(node.id, 1)}
          >
            ↓
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="إضافة قسم فرعي"
            disabled={busy}
            onClick={() => onAddChild(node.id)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="تعديل"
            disabled={busy}
            onClick={() => onEdit(node)}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="حذف"
            disabled={busy}
            onClick={() => onDelete(node.id)}
            className="h-8 w-8 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {hasChildren && !isCollapsed ? (
        <ul className="mt-1 space-y-1">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
              busy={busy}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function flatten(tree: ManagerCategory[]): string[] {
  const ids: string[] = [];
  const walk = (nodes: ManagerCategory[]) => {
    for (const node of nodes) {
      ids.push(node.id);
      walk(node.children);
    }
  };
  walk(tree);
  return ids;
}
