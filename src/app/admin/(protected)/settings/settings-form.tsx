'use client';

/**
 * Admin settings form (PHASE-10).
 *
 * - Text fields PATCH /api/admin/settings (zod-validated, Arabic errors).
 * - Logo/favicon upload POST /api/admin/settings/{logo,favicon} (multipart,
 *   public media D-4); DELETE resets to the built-in default.
 * - The WhatsApp number is validated server-side with the SAME Egyptian
 *   normalization the storefront uses; the message template placeholders
 *   keep the PHASE-07 builder contract.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ImageIcon, Loader2, RotateCcw, Upload } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LogoMark } from '@/components/brand/logo-mark';

type SettingsDraft = {
  storeName: string;
  whatsappPhone: string;
  whatsappMessageTemplate: string;
  supportPhone: string | null;
  footerText: string | null;
  socialLinks: { instagram?: string; facebook?: string; tiktok?: string } | null;
};

type BrandAssetKind = 'logo' | 'favicon';

type BrandAssetState = {
  url: string | null;
  isCustom: boolean;
  file: File | null;
  previewUrl: string | null;
  imageFailed: boolean;
  busy: boolean;
};

const DEFAULT_BRAND_ASSETS: Record<BrandAssetKind, string> = {
  logo: '/brand/logo-mark-512.png',
  favicon: '/icon.svg',
};

const TEMPLATE_HELP = [
  'ال placeholders المتاحة:',
  '{store_name} اسم المتجر · {order_number} رقم الطلب · {items} تفاصيل المنتجات',
  '{products_total} الإجمالي · {payment_method} طريقة الدفع',
  '{customer_name} الاسم · {address} العنوان',
].join(' ');

export function SettingsForm({
  initial,
  branding,
}: {
  initial: SettingsDraft;
  branding: { logoUrl: string | null; faviconUrl: string | null };
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<SettingsDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [brandAssets, setBrandAssets] = useState<Record<BrandAssetKind, BrandAssetState>>({
    logo: {
      url: branding.logoUrl,
      isCustom: Boolean(branding.logoUrl),
      file: null,
      previewUrl: null,
      imageFailed: false,
      busy: false,
    },
    favicon: {
      url: branding.faviconUrl,
      isCustom: Boolean(branding.faviconUrl),
      file: null,
      previewUrl: null,
      imageFailed: false,
      busy: false,
    },
  });
  const previewUrls = useRef<Record<BrandAssetKind, string | null>>({
    logo: null,
    favicon: null,
  });

  useEffect(
    () => () => {
      Object.values(previewUrls.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    },
    [],
  );

  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  function updateBrandAsset(kind: BrandAssetKind, update: Partial<BrandAssetState>) {
    setBrandAssets((current) => ({
      ...current,
      [kind]: { ...current[kind], ...update },
    }));
  }

  function clearBrandPreview(kind: BrandAssetKind) {
    const url = previewUrls.current[kind];
    if (url) URL.revokeObjectURL(url);
    previewUrls.current[kind] = null;
  }

  function chooseBrandImage(kind: BrandAssetKind, file: File) {
    const previousUrl = previewUrls.current[kind];
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const previewUrl = URL.createObjectURL(file);
    previewUrls.current[kind] = previewUrl;
    updateBrandAsset(kind, { file, previewUrl, imageFailed: false });
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: draft.storeName,
          whatsappPhone: draft.whatsappPhone,
          whatsappMessageTemplate: draft.whatsappMessageTemplate,
          supportPhone: draft.supportPhone ?? '',
          footerText: draft.footerText ?? '',
          socialLinks: draft.socialLinks ?? {},
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast({ title: payload?.error ?? 'تعذر حفظ الإعدادات.', variant: 'destructive' });
        return;
      }
      toast({ title: 'تم حفظ الإعدادات بنجاح.' });
    } finally {
      setSaving(false);
    }
  }

  async function uploadBrandImage(kind: BrandAssetKind) {
    const file = brandAssets[kind].file;
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast({
        title: 'حجم الصورة يتجاوز الحد الأقصى (٤ ميغابايت).',
        variant: 'destructive',
      });
      return;
    }
    updateBrandAsset(kind, { busy: true });
    try {
      const body = new FormData();
      body.set('file', file);
      let response: Response;
      try {
        response = await fetch(`/api/admin/settings/${kind}`, {
          method: 'POST',
          body,
        });
      } catch {
        toast({ title: 'تعذر الاتصال لرفع الصورة. تحقّق من الاتصال ثم أعد المحاولة.', variant: 'destructive' });
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast({ title: payload?.error ?? 'تعذر رفع الملف.', variant: 'destructive' });
        return;
      }
      if (typeof payload?.url !== 'string' || !payload.url) {
        toast({ title: 'تم الرفع دون إرجاع رابط الصورة؛ أعد المحاولة.', variant: 'destructive' });
        return;
      }
      clearBrandPreview(kind);
      updateBrandAsset(kind, {
        url: payload.url,
        isCustom: true,
        file: null,
        previewUrl: null,
        imageFailed: false,
      });
      toast({ title: kind === 'logo' ? 'تم تحديث الشعار.' : 'تم تحديث الأيقونة.' });
    } finally {
      updateBrandAsset(kind, { busy: false });
    }
  }

  async function resetBrandImage(kind: BrandAssetKind) {
    const current = brandAssets[kind];
    if (!current.isCustom) {
      clearBrandPreview(kind);
      updateBrandAsset(kind, { file: null, previewUrl: null, imageFailed: false });
      return;
    }
    updateBrandAsset(kind, { busy: true });
    try {
      let response: Response;
      try {
        response = await fetch(`/api/admin/settings/${kind}`, { method: 'DELETE' });
      } catch {
        toast({ title: 'تعذر الاتصال لإعادة الصورة الافتراضية. أعد المحاولة.', variant: 'destructive' });
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast({ title: payload?.error ?? 'تعذر الإعادة للافتراضي.', variant: 'destructive' });
        return;
      }
      clearBrandPreview(kind);
      updateBrandAsset(kind, {
        url: null,
        isCustom: false,
        file: null,
        previewUrl: null,
        imageFailed: false,
      });
      toast({ title: 'تمت الإعادة إلى الشعار الافتراضي.' });
    } finally {
      updateBrandAsset(kind, { busy: false });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Identity */}
      <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="identity-h">
        <h2 id="identity-h" className="text-lg font-bold">
          هوية المتجر
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="store-name">اسم المتجر</Label>
            <Input
              id="store-name"
              value={draft.storeName}
              onChange={(e) => set('storeName', e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="footer-text">نص التذييل</Label>
            <Input
              id="footer-text"
              value={draft.footerText ?? ''}
              onChange={(e) => set('footerText', e.target.value)}
              maxLength={200}
            />
          </div>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          معاينة الهوية الحالية وإدارتها — تظهر التغييرات في المتجر بعد الحفظ.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.8fr)]">
          <BrandAssetCard
            kind="logo"
            title="شعار المتجر"
            description="يظهر بجوار اسم المتجر في الواجهة. الحد الأقصى ٤ ميغابايت."
            asset={brandAssets.logo}
            storeName={draft.storeName}
            onChoose={chooseBrandImage}
            onUpload={uploadBrandImage}
            onReset={resetBrandImage}
            onImageError={(kind) => updateBrandAsset(kind, { imageFailed: true })}
          />
          <BrandAssetCard
            kind="favicon"
            title="أيقونة المتصفح"
            description="تظهر في تبويب المتصفح. يُفضّل استخدام صورة مربعة شفافة."
            asset={brandAssets.favicon}
            storeName={draft.storeName}
            onChoose={chooseBrandImage}
            onUpload={uploadBrandImage}
            onReset={resetBrandImage}
            onImageError={(kind) => updateBrandAsset(kind, { imageFailed: true })}
          />
        </div>
      </section>

      {/* Communication */}
      <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="comm-h">
        <h2 id="comm-h" className="text-lg font-bold">
          التواصل وواتساب
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wa-phone">رقم واتساب المتجر (مصري)</Label>
            <Input
              id="wa-phone"
              dir="ltr"
              value={draft.whatsappPhone}
              onChange={(e) => set('whatsappPhone', e.target.value)}
              maxLength={24}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="support-phone">رقم الدعم (اختياري)</Label>
            <Input
              id="support-phone"
              dir="ltr"
              value={draft.supportPhone ?? ''}
              onChange={(e) => set('supportPhone', e.target.value)}
              maxLength={24}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="wa-template">قالب رسالة واتساب</Label>
          <p className="text-xs text-muted-foreground">{TEMPLATE_HELP}</p>
          <Textarea
            id="wa-template"
            rows={8}
            dir="rtl"
            className="font-mono text-xs"
            value={draft.whatsappMessageTemplate}
            onChange={(e) => set('whatsappMessageTemplate', e.target.value)}
            maxLength={2000}
          />
        </div>
      </section>

      {/* Social */}
      <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="social-h">
        <h2 id="social-h" className="text-lg font-bold">
          روابط التواصل الاجتماعي
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          الروابط الفارغة لا تظهر في التذييل. يجب أن تبدأ بـ https://
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="social-instagram">إنستغرام</Label>
            <Input
              id="social-instagram"
              dir="ltr"
              placeholder="https://instagram.com/…"
              value={draft.socialLinks?.instagram ?? ''}
              onChange={(e) =>
                set('socialLinks', {
                  ...(draft.socialLinks ?? {}),
                  instagram: e.target.value.trim() || undefined,
                })
              }
              maxLength={300}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="social-facebook">فيسبوك</Label>
            <Input
              id="social-facebook"
              dir="ltr"
              placeholder="https://facebook.com/…"
              value={draft.socialLinks?.facebook ?? ''}
              onChange={(e) =>
                set('socialLinks', {
                  ...(draft.socialLinks ?? {}),
                  facebook: e.target.value.trim() || undefined,
                })
              }
              maxLength={300}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="social-tiktok">تيك توك</Label>
            <Input
              id="social-tiktok"
              dir="ltr"
              placeholder="https://tiktok.com/@…"
              value={draft.socialLinks?.tiktok ?? ''}
              onChange={(e) =>
                set('socialLinks', {
                  ...(draft.socialLinks ?? {}),
                  tiktok: e.target.value.trim() || undefined,
                })
              }
              maxLength={300}
            />
          </div>
        </div>
      </section>

      <div>
        <Button disabled={saving} onClick={save} size="lg">
          {saving ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          حفظ الإعدادات
        </Button>
      </div>
    </div>
  );
}

function BrandAssetCard({
  kind,
  title,
  description,
  asset,
  storeName,
  onChoose,
  onUpload,
  onReset,
  onImageError,
}: {
  kind: BrandAssetKind;
  title: string;
  description: string;
  asset: BrandAssetState;
  storeName: string;
  onChoose: (kind: BrandAssetKind, file: File) => void;
  onUpload: (kind: BrandAssetKind) => void;
  onReset: (kind: BrandAssetKind) => void;
  onImageError: (kind: BrandAssetKind) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isLogo = kind === 'logo';
  const isDefault = !asset.isCustom && !asset.previewUrl;
  const imageSrc =
    asset.previewUrl ?? asset.url ?? DEFAULT_BRAND_ASSETS[kind];
  const status = asset.imageFailed
    ? 'تعذر تحميل الصورة'
    : asset.previewUrl
      ? 'معاينة قبل الحفظ'
      : isDefault
        ? 'الشعار الافتراضي'
        : 'الصورة المخصصة الحالية';

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-border/80 bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-foreground">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            asset.previewUrl
              ? 'bg-blush text-secondary-foreground'
              : 'border border-border bg-surface-subtle text-foreground-muted'
          }`}
        >
          {status}
        </span>
      </div>

      <div
        className={`relative mt-4 flex min-w-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-surface-subtle/45 p-4 ${
          isLogo ? 'min-h-40 sm:min-h-48' : 'min-h-36 sm:min-h-40'
        }`}
      >
        {asset.imageFailed ? (
          <div className="flex flex-col items-center gap-2 text-center">
            {isLogo ? (
              <DefaultLogoPreview storeName={storeName} compact />
            ) : (
              <img
                src={DEFAULT_BRAND_ASSETS.favicon}
                alt=""
                className="size-14 object-contain sm:size-16"
              />
            )}
            <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle aria-hidden className="size-3.5" />
              {asset.previewUrl
                ? 'تعذر عرض المعاينة؛ تظهر الصورة الافتراضية مؤقتًا.'
                : 'تعذر تحميل الصورة الحالية؛ تظهر الافتراضية مؤقتًا.'}
            </span>
          </div>
        ) : isLogo && isDefault ? (
          <DefaultLogoPreview storeName={storeName} />
        ) : (
          <img
            src={imageSrc}
            alt={title}
            className={
              isLogo
                ? 'max-h-28 max-w-full object-contain sm:max-h-36'
                : 'size-14 object-contain sm:size-16'
            }
            onError={() => onImageError(kind)}
          />
        )}
      </div>

      <input
        ref={inputRef}
        id={`${kind}-file`}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label={`اختيار ${title} جديد`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onChoose(kind, file);
          event.target.value = '';
        }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={asset.busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload aria-hidden className="size-4" />
          استبدال {isLogo ? 'الشعار' : 'الأيقونة'}
        </Button>
        {asset.file ? (
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={asset.busy}
            onClick={() => onUpload(kind)}
          >
            {asset.busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <ImageIcon aria-hidden className="size-4" />
            )}
            حفظ {isLogo ? 'الشعار' : 'الأيقونة'}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 text-muted-foreground"
          disabled={asset.busy || (!asset.isCustom && !asset.file)}
          onClick={() => onReset(kind)}
        >
          {asset.busy && asset.isCustom ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <RotateCcw aria-hidden className="size-4" />
          )}
          إعادة الافتراضي
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {asset.file ? `الصورة الجديدة جاهزة للمعاينة — ${asset.file.name}` : 'الصورة الحالية محفوظة في إعدادات المتجر.'}
      </p>
    </article>
  );
}

function DefaultLogoPreview({
  storeName,
  compact = false,
}: {
  storeName: string;
  compact?: boolean;
}) {
  return (
    <div className="flex max-w-full items-center gap-3" dir="rtl">
      <LogoMark className={compact ? 'size-12 shrink-0' : 'size-16 shrink-0 sm:size-20'} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-base font-extrabold tracking-tight text-foreground sm:text-lg">
          {storeName}
        </span>
        <span dir="ltr" lang="en" className="text-[10px] font-semibold tracking-[0.14em] text-gold-deep">
          AMIRA STORE
        </span>
      </span>
    </div>
  );
}
