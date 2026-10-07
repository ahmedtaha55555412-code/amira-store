'use client';

/**
 * Media manager client (PHASE-04 tasks 10 & 11 UI + PHASE-12 completion).
 * Upload (multipart, validated server-side) · alt-text edit · guarded delete
 * · access-mode/type filters · copy public URL · unreferenced badge ·
 * private-asset thumbnails through the authenticated admin content route.
 * When the storage provider is unconfigured the upload flow shows the exact
 * honest remediation instead of failing silently.
 */

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { Check, Copy, HardDriveDownload, Loader2, Lock, Pencil, Trash2, Upload } from 'lucide-react';

import { AssetImage } from '@/components/admin/asset-image';
import { Badge } from '@/components/ui/badge';
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
  accessMode: 'public' | 'private';
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  unreferenced: boolean;
};

type AccessFilter = 'all' | 'public' | 'private';

const ACCESS_FILTER_LABELS: Record<AccessFilter, string> = {
  all: 'الكل',
  public: 'عامة',
  private: 'خاصة',
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} ب`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

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
  // PHASE-12 library filters (client-side over the page's registry snapshot).
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredAssets = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return initialAssets.filter((asset) => {
      if (accessFilter !== 'all' && asset.accessMode !== accessFilter) return false;
      if (!needle) return true;
      return (
        asset.pathname.toLowerCase().includes(needle) ||
        (asset.altText ?? '').toLowerCase().includes(needle)
      );
    });
  }, [initialAssets, accessFilter, search]);

  /** PRIVATE assets render through the session-gated content route — the
      provider URL of a private-store object is not publicly fetchable. */
  function thumbnailSrc(asset: MediaAssetView): string {
    return asset.accessMode === 'private'
      ? `/api/admin/media/${asset.id}/content`
      : asset.url;
  }

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    setBusy(true);
    let uploaded = 0;
    let failed = 0;
    for (const file of Array.from(files).slice(0, 10)) {
      if (file.size > 4 * 1024 * 1024) {
        failed += 1;
        toast({
          title: `تعذر رفع: ${file.name}`,
          description: 'حجم الصورة يتجاوز الحد الأقصى (٤ ميغابايت).',
          variant: 'destructive',
        });
        continue;
      }
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

  async function copyUrl(asset: MediaAssetView) {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId(null), 1500);
      toast({ title: 'تم نسخ الرابط العام.' });
    } catch {
      toast({ title: 'تعذر النسخ من المتصفح.', variant: 'destructive' });
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
              اربط مخزن Vercel Blob بالمشروع ليُضاف متغيرات المصادقة{' '}
              <span dir="ltr" className="font-mono text-xs">
                BLOB_STORE_ID + VERCEL_OIDC_TOKEN
              </span>{' '}
              تلقائيًا (أو التوكن القديم{' '}
              <span dir="ltr" className="font-mono text-xs">
                BLOB_READ_WRITE_TOKEN
              </span>
              ). حتى ذلك يمكنك إدارة أصول المكتبة الموجودة وإرفاقها بالمنتجات.
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
            onChange={(event) => onUpload(event.target.files)}
            className="hidden"
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
            JPG / PNG / WebP / AVIF · حتى ٤ ميغابايت · ١٠ ملفات دفعة واحدة
          </p>
        </div>
      )}

      {/* PHASE-12 filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(ACCESS_FILTER_LABELS) as AccessFilter[]).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={accessFilter === key ? 'default' : 'outline'}
            className="min-h-9 rounded-full"
            onClick={() => setAccessFilter(key)}
            aria-pressed={accessFilter === key}
          >
            {ACCESS_FILTER_LABELS[key]}
          </Button>
        ))}
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="بحث بالمسار أو النص البديل"
          aria-label="بحث في الوسائط"
          className="ms-auto h-9 w-56 rounded-full"
        />
        <span className="text-xs text-muted-foreground">
          {filteredAssets.length} من {initialAssets.length} أصلًا
        </span>
      </div>

      {filteredAssets.length === 0 ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {initialAssets.length === 0
            ? 'المكتبة فارغة.'
            : 'لا توجد أصول مطابقة لهذا الفلتر.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filteredAssets.map((asset) => (
            <figure key={asset.id} className="overflow-hidden rounded-2xl border bg-card">
              <div className="relative flex aspect-square items-center justify-center bg-surface-subtle">
                <AssetImage
                  src={thumbnailSrc(asset)}
                  alt={asset.altText ?? 'وسيط'}
                  className="h-full w-full object-contain"
                />
                {asset.accessMode === 'private' ? (
                  <span
                    className="absolute top-2 end-2 inline-flex items-center gap-1 rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] font-semibold text-background"
                    title="أصل خاص — يُسلَّم للمشرف فقط عبر المسار المُصادق"
                  >
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    خاص
                  </span>
                ) : null}
              </div>
              <figcaption className="space-y-1.5 p-3">
                <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
                  {asset.width}×{asset.height} · {asset.mimeType.replace('image/', '')} ·{' '}
                  {formatBytes(asset.sizeBytes)}
                </p>
                <p className="truncate text-xs font-medium text-foreground">
                  {asset.altText ?? 'بدون نص بديل'}
                </p>
                {asset.unreferenced ? (
                  <Badge variant="outline" className="bg-card text-[10px]">
                    غير مرجوع في أي مجال
                  </Badge>
                ) : null}
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
                  {asset.accessMode === 'public' ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="نسخ الرابط العام"
                      onClick={() => copyUrl(asset)}
                    >
                      {copiedId === asset.id ? (
                        <Check className="h-4 w-4 text-success" aria-hidden="true" />
                      ) : (
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  ) : null}
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
              بانرات، لحماية مراجع قاعدة البيانات. يُسجَّل الحذف في سجل النشاط.
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
