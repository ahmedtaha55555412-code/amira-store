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

import { useRef, useState } from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type SettingsDraft = {
  storeName: string;
  whatsappPhone: string;
  whatsappMessageTemplate: string;
  supportPhone: string | null;
  footerText: string | null;
  socialLinks: { instagram?: string; facebook?: string; tiktok?: string } | null;
};

const TEMPLATE_HELP = [
  'ال placeholders المتاحة:',
  '{store_name} اسم المتجر · {order_number} رقم الطلب · {items} تفاصيل المنتجات',
  '{products_total} الإجمالي · {payment_method} طريقة الدفع',
  '{customer_name} الاسم · {address} العنوان',
].join(' ');

export function SettingsForm({ initial }: { initial: SettingsDraft }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<SettingsDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [faviconBusy, setFaviconBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

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

  async function uploadBrandImage(kind: 'logo' | 'favicon', file: File) {
    const busy = kind === 'logo' ? setLogoBusy : setFaviconBusy;
    busy(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch(`/api/admin/settings/${kind}`, {
        method: 'POST',
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast({ title: payload?.error ?? 'تعذر رفع الملف.', variant: 'destructive' });
        return;
      }
      toast({ title: kind === 'logo' ? 'تم تحديث الشعار.' : 'تم تحديث الأيقونة.' });
    } finally {
      busy(false);
    }
  }

  async function resetBrandImage(kind: 'logo' | 'favicon') {
    const busy = kind === 'logo' ? setLogoBusy : setFaviconBusy;
    busy(true);
    try {
      const response = await fetch(`/api/admin/settings/${kind}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast({ title: payload?.error ?? 'تعذر الإعادة للافتراضي.', variant: 'destructive' });
        return;
      }
      toast({ title: 'تمت الإعادة إلى الشعار الافتراضي.' });
    } finally {
      busy(false);
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

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl border p-4">
            <Label htmlFor="logo-file">شعار المتجر (صورة عامة)</Label>
            <p className="text-xs text-muted-foreground">
              عند عدم الرفع يظهر الشعار الافتراضي.
            </p>
            <Input
              id="logo-file"
              ref={logoInput}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadBrandImage('logo', file);
                e.target.value = '';
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={logoBusy}
              onClick={() => resetBrandImage('logo')}
            >
              {logoBusy ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Trash2 aria-hidden className="size-4" />
              )}
              إعادة الافتراضي
            </Button>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border p-4">
            <Label htmlFor="favicon-file">أيقونة المتجر (favicon)</Label>
            <p className="text-xs text-muted-foreground">
              مربّعة 512×512 على الأفضل — تظهر في تبويب المتصفح.
            </p>
            <Input
              id="favicon-file"
              ref={faviconInput}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadBrandImage('favicon', file);
                e.target.value = '';
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={faviconBusy}
              onClick={() => resetBrandImage('favicon')}
            >
              {faviconBusy ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Trash2 aria-hidden className="size-4" />
              )}
              إعادة الافتراضي
            </Button>
          </div>
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
