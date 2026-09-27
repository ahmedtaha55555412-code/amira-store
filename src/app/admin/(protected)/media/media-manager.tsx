'use client';

/**
 * Media manager client (PHASE-04 tasks 10 & 11 UI).
 * Upload (multipart, validated server-side) · alt-text edit · guarded delete.
 * When the storage provider is unconfigured the upload flow shows the exact
 * honest remediation instead of failing silently.
 */

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { HardDriveDownload, Loader2, Pencil, Trash2, Upload } from 'lucide-react';

import { AssetImage } from '@/components/admin/asset-image';
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
import { useToast } from '@/hooks/use-toast';

export type MediaAssetView = {
  id: string;
  url: string;
  pathname: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  altText: string | null;
};

export function MediaManager({
  initialAssets,
  uploadConfigured,
}: {
  initialAssets: MediaAssetView[];
  uploadConfigured: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<MediaAssetView | null>(null);
  const [editing, setEditing] = useState<MediaAssetView | null>(null);
  const [editAlt, setEditAlt] = useState('');

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    setBusy(true);
    let uploaded = 0;
    let failed = 0;
    for (const file of Array.from(files).slice(0, 10)) {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/admin/media/upload', {
        method: 'POST',
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (response.ok) uploaded += 1;
      else {
        failed += 1;
        toast({
          title: `تعذر رفع: ${file.name}`,
          description: data.error ?? 'خطأ غير متوقع.',
          variant: 'destructive',
        });
      }
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = '';
    if (uploaded > 0) {
      toast({ title: `تم رفع ${uploaded} صورة` });
      router.refresh();
    }
    if (failed === 0 && uploaded === 0) {
      // nothing selected
    }
  }

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    const response = await fetch(`/api/admin/media/${deleting.id}`, { method: 'DELETE' });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (response.ok) {
      toast({ title: 'تم حذف الوسيط' });
      setDeleting(null);
      router.refresh();
    } else {
      toast({ title: 'تعذر الحذف', description: data.error, variant: 'destructive' });
      setDeleting(null);
    }
  }

  async function saveAltText() {
    if (!editing || busy) return;
    setBusy(true);
    const response = await fetch(`/api/admin/media/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ altText: editAlt.trim() || null }),
    });
    setBusy(false);
    if (response.ok) {
      toast({ title: 'تم حفظ النص البديل' });
      setEditing(null);
      router.refresh();
    } else {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      toast({ title: 'تعذر الحفظ', description: data.error, variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4">
      {!uploadConfigured ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          <HardDriveDownload className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">رفع الصور غير مفعّل في هذه البيئة.</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              اربط مخزن Vercel Blob بالمشروع ليُضاف المتغير{' '}
              <span dir="ltr" className="font-mono text-xs">
                BLOB_READ_WRITE_TOKEN
              </span>{' '}
              تلقائيًا. حتى ذلك يمكنك إدارة أصول المكتبة الموجودة وإرفاقها
              بالمنتجات.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            className="hidden"
            onChange={(event) => onUpload(event.target.files)}
          />
          <Button onClick={() => fileInput.current?.click()} disabled={busy} className="gap-2">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            رفع صور
          </Button>
          <p className="text-xs text-muted-foreground">
            JPG / PNG / WebP / AVIF · حتى ٨ ميغابايت · ١٠ ملفات دفعة واحدة
          </p>
        </div>
      )}

      {initialAssets.length === 0 ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
          المكتبة فارغة.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {initialAssets.map((asset) => (
            <figure key={asset.id} className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex aspect-square items-center justify-center bg-surface-subtle">
                <AssetImage
                  src={asset.url}
                  alt={asset.altText ?? 'وسيط'}
                  className="h-full w-full object-contain"
                />
              </div>
              <figcaption className="space-y-1.5 p-3">
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {asset.width}×{asset.height} · {asset.mimeType.replace('image/', '')}
                </p>
                <p className="truncate text-xs font-medium text-foreground">
                  {asset.altText ?? 'بدون نص بديل'}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="تعديل النص البديل"
                    onClick={() => {
                      setEditing(asset);
                      setEditAlt(asset.altText ?? '');
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label="حذف"
                    onClick={() => setDeleting(asset)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>حذف الوسيط</DialogTitle>
            <DialogDescription>
              سيُرفض الحذف إذا كان الوسيط مستخدمًا في منتجات أو تقييمات أو
              بانرات، لحماية مراجع قاعدة البيانات.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              إلغاء
            </Button>
            <Button variant="destructive" disabled={busy} onClick={confirmDelete} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>النص البديل (alt)</DialogTitle>
            <DialogDescription>
              يُستخدم للوصولية وتحسين محركات البحث.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="asset-alt">نص بديل</Label>
            <Input
              id="asset-alt"
              value={editAlt}
              onChange={(event) => setEditAlt(event.target.value)}
              maxLength={300}
              className="h-11"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button disabled={busy} onClick={saveAltText} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
