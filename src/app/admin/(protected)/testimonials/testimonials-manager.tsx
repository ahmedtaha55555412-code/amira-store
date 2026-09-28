'use client';

/**
 * WhatsApp testimonials manager (PHASE-09). Admin-only client island:
 *  - upload form: screenshot + optional display name / city / caption /
 *    product association → multipart POST (registers PRIVATE, draft);
 *  - per-row actions: publish (dialog REQUIRES the privacy confirmation —
 *    a deliberate data contract, not a UI-only checkbox), hide, edit fields
 *    + sort order, all via the admin APIs with honest Arabic errors and
 *    server refresh after every committed change.
 */

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { EyeOff, Loader2, Pencil, Send, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatAdminDateTime } from '@/lib/admin/format';
import type {
  AdminTestimonialListItem,
} from '@/lib/admin/testimonials';

type ProductOption = { id: string; name: string };

const STATUS_CHIP = {
  draft: 'bg-warning/15 text-amber-700',
  published: 'bg-success/10 text-success',
  hidden: 'bg-muted text-muted-foreground',
} as const;

const STATUS_LABEL = {
  draft: 'مسودة (خاصة)',
  published: 'منشورة',
  hidden: 'مخفية',
} as const;

export function TestimonialsManager({
  items,
  productOptions,
}: {
  items: AdminTestimonialListItem[];
  productOptions: ProductOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadOk, setUploadOk] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError(null);
    setUploadOk(null);

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      setUploadError('برجاء اختيار صورة (JPG / PNG / WebP / AVIF — حتى ٨ ميغابايت).');
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const displayName = (form.elements.namedItem('displayName') as HTMLInputElement).value;
      const city = (form.elements.namedItem('city') as HTMLInputElement).value;
      const caption = (form.elements.namedItem('caption') as HTMLTextAreaElement).value;
      const productId = (form.elements.namedItem('productId') as HTMLSelectElement).value;
      const altText = (form.elements.namedItem('altText') as HTMLInputElement).value;
      if (displayName.trim()) body.set('displayName', displayName);
      if (city.trim()) body.set('city', city);
      if (caption.trim()) body.set('caption', caption);
      if (altText.trim()) body.set('altText', altText);
      if (productId) body.set('productId', productId);

      const response = await fetch('/api/admin/testimonials', {
        method: 'POST',
        body,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setUploadError(payload.error ?? 'تعذّر رفع الشهادة. حاول مرة أخرى.');
        return;
      }
      setUploadOk('تم رفع الشهادة كمسودة خاصة — انشرها بعد مراجعة الخصوصية.');
      form.reset();
      setUploadFileName(null);
      router.refresh();
    } catch {
      setUploadError('تعذّر الاتصال بالخادم. حاول مرة أخرى.');
    } finally {
      setUploading(false);
    }
  }

  async function postJson(id: string, path: string, body: unknown) {
    const response = await fetch(`/api/admin/testimonials/${id}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      return { ok: false as const, error: payload.error ?? 'تعذّر تنفيذ الإجراء.' };
    }
    return { ok: true as const };
  }

  async function handlePublish(item: AdminTestimonialListItem) {
    setRowError(null);
    const confirmed = window.confirm(
      'قبل النشر: راجع لقطة الشاشة بعينك — هل تأكدت أن الصورة لا تعرض أرقام هواتف أو عناوين أو محتوى خاصًا لا ينبغي نشره؟\n\nالنشر يجعل الصورة عامة على المتجر مع شارة «عبر واتساب».',
    );
    if (!confirmed) return;
    const doubleConfirmed = window.confirm(
      'تأكيد نهائي: لقد راجعت لقطة الشاشة ويمكن نشرها بشكل عام.',
    );
    if (!doubleConfirmed) return;

    setBusyId(item.id);
    const result = await postJson(item.id, 'publish', { privacyConfirmed: true });
    if (!result.ok) {
      setRowError(result.error);
      setBusyId(null);
      return;
    }
    router.refresh();
    setBusyId(null);
  }

  async function handleHide(item: AdminTestimonialListItem) {
    setRowError(null);
    setBusyId(item.id);
    const result = await postJson(item.id, 'hide', {});
    if (!result.ok) {
      setRowError(result.error);
      setBusyId(null);
      return;
    }
    router.refresh();
    setBusyId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Upload (always available) */}
      <form
        ref={formRef}
        onSubmit={handleUpload}
        className="rounded-2xl border bg-card p-4 sm:p-5"
        noValidate
      >
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Upload aria-hidden className="size-4 text-primary" />
          إضافة شهادة واتساب جديدة
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          تُحفظ الصورة كمسودة خاصة — لا يمكن لأي زائر الوصول إليها حتى النشر
          المؤكد بمراجعة الخصوصية.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="testimonial-file" className="text-sm font-semibold">
              لقطة الشاشة *
            </Label>
            <Input
              id="testimonial-file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              required
              disabled={uploading}
              onChange={(event) => setUploadFileName(event.target.files?.[0]?.name ?? null)}
              className="file:me-3 file:rounded-full file:border-0 file:bg-blush file:px-3 file:py-1 file:text-xs file:font-semibold file:text-secondary-foreground"
            />
            {uploadFileName ? (
              <p className="text-xs text-muted-foreground" dir="ltr">
                {uploadFileName}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="testimonial-display-name" className="text-sm">
              اسم العميل المعروض (اختياري)
            </Label>
            <Input
              id="testimonial-display-name"
              name="displayName"
              maxLength={80}
              disabled={uploading}
              placeholder="مثال: أ. منال"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="testimonial-city" className="text-sm">
              المدينة (اختياري)
            </Label>
            <Input
              id="testimonial-city"
              name="city"
              maxLength={80}
              disabled={uploading}
              placeholder="مثال: القاهرة"
            />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="testimonial-caption" className="text-sm">
              تعليق (اختياري)
            </Label>
            <Textarea
              id="testimonial-caption"
              name="caption"
              maxLength={300}
              rows={2}
              disabled={uploading}
              placeholder="سياق قصير يوضح الشهادة — بدون اختلاق محتوى."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="testimonial-product" className="text-sm">
              ربط بمنتج (اختياري)
            </Label>
            <select
              id="testimonial-product"
              name="productId"
              disabled={uploading}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <option value="">— بدون ربط —</option>
              {productOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="testimonial-alt" className="text-sm">
              وصف الصورة (اختياري)
            </Label>
            <Input
              id="testimonial-alt"
              name="altText"
              maxLength={300}
              disabled={uploading}
              placeholder="وصف نصي للصورة لقارئات الشاشة"
            />
          </div>
        </div>

        {uploadError ? (
          <p role="alert" className="mt-3 rounded-xl bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">
            {uploadError}
          </p>
        ) : null}
        {uploadOk ? (
          <p role="status" className="mt-3 rounded-xl bg-success/10 px-4 py-2.5 text-sm font-medium text-success">
            {uploadOk}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={uploading}
          className="mt-4 min-h-11 gap-2 rounded-full px-6"
        >
          {uploading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
          رفع كمسودة خاصة
        </Button>
      </form>

      {/* List */}
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-surface-subtle/60 px-6 py-10 text-center text-sm text-muted-foreground">
          لا توجد شهادات في هذا التصنيف بعد.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id}>
              <article className="rounded-2xl border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="shrink-0">
                    <img
                      src={`/api/admin/media/${item.mediaAssetId}/content`}
                      alt="لقطة شاشة واتساب من عميل"
                      loading="lazy"
                      className="size-28 rounded-xl border object-cover"
                    />
                  </div>

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[item.status]}`}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ترتيب العرض: {item.sortOrder.toLocaleString('ar-EG-u-nu-latn')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatAdminDateTime(item.createdAt)}
                      </span>
                      {item.mediaAccessMode === 'private' ? (
                        <span className="text-xs font-medium text-amber-700">وسيط خاص</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">وسيط عام</span>
                      )}
                    </div>

                    <p className="mt-2 text-sm font-semibold">
                      {item.displayName ?? 'بدون اسم معروض'}
                    </p>
                    {item.city ? (
                      <p className="text-xs text-muted-foreground">{item.city}</p>
                    ) : null}
                    {item.caption ? (
                      <p className="mt-1 text-sm leading-loose text-foreground/90">
                        {item.caption}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      المنتج المرتبط:{' '}
                      {item.product ? (
                        <span className="font-semibold text-foreground">
                          {item.product.name}
                        </span>
                      ) : (
                        'بدون'
                      )}
                    </p>
                  </div>
                </div>

                {rowError && busyId === item.id ? (
                  <p role="alert" className="mt-3 text-xs font-medium text-destructive">
                    {rowError}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                  {item.status !== 'published' ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId !== null}
                      onClick={() => handlePublish(item)}
                      className="min-h-9 rounded-full"
                    >
                      {busyId === item.id ? (
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                      ) : null}
                      نشر (بعد تأكيد الخصوصية)
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId !== null}
                      onClick={() => handleHide(item)}
                      className="min-h-9 gap-1.5 rounded-full"
                    >
                      {busyId === item.id ? (
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                      ) : (
                        <EyeOff aria-hidden className="size-4" />
                      )}
                      إخفاء من المتجر
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId !== null}
                    onClick={() =>
                      setEditingId(editingId === item.id ? null : item.id)
                    }
                    className="min-h-9 gap-1.5 rounded-full"
                  >
                    <Pencil aria-hidden className="size-4" />
                    {editingId === item.id ? 'إغلاق التعديل' : 'تعديل البيانات'}
                  </Button>
                </div>

                {editingId === item.id ? (
                  <TestimonialEditForm
                    item={item}
                    productOptions={productOptions}
                    busy={busyId !== null}
                    onDone={() => {
                      setEditingId(null);
                      router.refresh();
                    }}
                    onBusy={(value) => setBusyId(value ? item.id : null)}
                    onError={(message) => setRowError(message)}
                  />
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TestimonialEditForm({
  item,
  productOptions,
  busy,
  onDone,
  onBusy,
  onError,
}: {
  item: AdminTestimonialListItem;
  productOptions: ProductOption[];
  busy: boolean;
  onDone: () => void;
  onBusy: (value: boolean) => void;
  onError: (message: string | null) => void;
}) {
  const [displayName, setDisplayName] = useState(item.displayName ?? '');
  const [city, setCity] = useState(item.city ?? '');
  const [caption, setCaption] = useState(item.caption ?? '');
  const [productId, setProductId] = useState(item.product?.id ?? '');
  const [sortOrder, setSortOrder] = useState(String(item.sortOrder));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onError(null);
    onBusy(true);
    try {
      const response = await fetch(`/api/admin/testimonials/${item.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          city,
          caption,
          productId: productId || null,
          sortOrder: Number(sortOrder),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        onError(payload.error ?? 'تعذّر حفظ التعديلات.');
        onBusy(false);
        return;
      }
      onDone();
    } catch {
      onError('تعذّر الاتصال بالخادم. حاول مرة أخرى.');
      onBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-3 rounded-xl border bg-surface-subtle/40 p-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`edit-name-${item.id}`} className="text-xs">
          الاسم المعروض
        </Label>
        <Input
          id={`edit-name-${item.id}`}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={80}
          disabled={busy}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`edit-city-${item.id}`} className="text-xs">
          المدينة
        </Label>
        <Input
          id={`edit-city-${item.id}`}
          value={city}
          onChange={(event) => setCity(event.target.value)}
          maxLength={80}
          disabled={busy}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={`edit-caption-${item.id}`} className="text-xs">
          التعليق
        </Label>
        <Textarea
          id={`edit-caption-${item.id}`}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={300}
          rows={2}
          disabled={busy}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`edit-product-${item.id}`} className="text-xs">
          المنتج المرتبط
        </Label>
        <select
          id={`edit-product-${item.id}`}
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          disabled={busy}
          className="flex h-10 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <option value="">— بدون ربط —</option>
          {productOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`edit-sort-${item.id}`} className="text-xs">
          ترتيب العرض (٠–٩٩٩٩)
        </Label>
        <Input
          id={`edit-sort-${item.id}`}
          type="number"
          min={0}
          max={9999}
          step={1}
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          disabled={busy}
          dir="ltr"
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy} className="min-h-9 rounded-full">
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          حفظ التعديلات
        </Button>
      </div>
    </form>
  );
}
