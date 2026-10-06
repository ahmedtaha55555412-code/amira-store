'use client';

/**
 * Admin homepage manager UI (PHASE-10).
 *
 * Two panels:
 * 1. Sections — visibility switch, title/subtitle edits, per-key config
 *    editing (announcement message, hero copy/CTA, benefits items, brand
 *    story body, WhatsApp CTA copy), and reorder (up/down buttons writing
 *    the complete order atomically).
 * 2. Banners — public-image upload (D-4), activation, ordering, delete.
 *
 * Query-driven sections expose framing edits ONLY — no product selection
 * exists anywhere (hard exclusion, MASTER_PLAN §4).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
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

type SectionRow = {
  id: string;
  sectionKey: string;
  label: string;
  known: boolean;
  title: string | null;
  subtitle: string | null;
  isEnabled: boolean;
  sortOrder: number;
  config: Record<string, unknown> | null;
};

type BannerRow = {
  id: string;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  mediaUrl: string;
};

type Props = { sections: SectionRow[]; banners: BannerRow[] };

/** Query-driven keys: framing edits only (title/subtitle/visibility). */
const FRAMING_ONLY_KEYS = new Set([
  'categories',
  'new_arrivals',
  'offers',
  'reviews',
  'testimonials',
]);

export function HomepageManager({ sections, banners }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  const [drafts, setDrafts] = useState<Record<string, SectionRow>>(() =>
    Object.fromEntries(sections.map((s) => [s.id, s])),
  );

  const setDraft = (id: string, patch: Partial<SectionRow>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));

  async function saveSection(id: string) {
    const draft = drafts[id]!;
    const original = sections.find((s) => s.id === id)!;
    setBusyId(id);

    const body: Record<string, unknown> = {};
    if (draft.title !== original.title) body.title = draft.title;
    if (draft.subtitle !== original.subtitle) body.subtitle = draft.subtitle;
    if (draft.isEnabled !== original.isEnabled) body.isEnabled = draft.isEnabled;
    if (JSON.stringify(draft.config) !== JSON.stringify(original.config)) {
      // Normalize: empty-string fields are "cleared" (omitted), and a fully
      // empty config object means "restore the code defaults" (config: null)
      // — mirrors the server contract instead of tripping its min(1) checks.
      const source = (draft.config ?? {}) as Record<string, unknown>;
      const cleaned = Object.fromEntries(
        Object.entries(source).filter(
          ([, v]) => !(typeof v === "string" && v.trim() === ""),
        ),
      );
      body.config = Object.keys(cleaned).length > 0 ? cleaned : null;
    }

    if (Object.keys(body).length === 0) {
      setBusyId(null);
      toast({ title: 'لا توجد تغييرات لحفظها.' });
      return;
    }

    try {
      const response = await fetch(`/api/admin/homepage/sections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast({ title: payload?.error ?? 'تعذر حفظ القسم.', variant: 'destructive' });
        return;
      }
      toast({ title: 'تم حفظ القسم بنجاح.' });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;

    // The announcement bar is fixed chrome at the very top of the homepage
    // (PHASE-10 spec: position 1) — its copy/visibility are editable, its
    // position is not.
    const moving = sections[index]!;
    const neighbor = sections[target]!;
    if (moving.sectionKey === "announcement" || neighbor.sectionKey === "announcement") {
      toast({ title: "شريط الإعلانات ثابت في الأعلى — يمكن تعديل نصه وإظهاره فقط." });
      return;
    }

    const ids = sections.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved!);

    setBusyId(sections[index]!.id);
    try {
      const response = await fetch('/api/admin/homepage/sections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: ids }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast({ title: payload?.error ?? 'تعذر إعادة الترتيب.', variant: 'destructive' });
        return;
      }
      toast({ title: 'تم تحديث ترتيب الأقسام.' });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ------------------------------------------------ Sections panel -- */}
      <section aria-labelledby="sections-heading" className="flex flex-col gap-4">
        <div>
          <h1 id="sections-heading" className="text-2xl font-extrabold">
            محتوى الصفحة الرئيسية
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تحكم في ظهور الأقسام وترتيبها ونصوصها. الأقسام التلقائية («وصل
            حديثًا»، «العروض») تبقى مدفوعة بالبيانات الفعلية — لا يمكن اختيار
            منتجات يدويًا.
          </p>
        </div>

        <ol className="flex flex-col gap-3">
          {sections.map((section, index) => {
            const draft = drafts[section.id] ?? section;
            const config = (draft.config ?? {}) as Record<string, unknown>;
            const setConfig = (patch: Record<string, unknown>) =>
              setDraft(section.id, { config: { ...config, ...patch } });
            const busy = busyId === section.id || (isPending && busyId === section.id);

            return (
              <li
                key={section.id}
                className="rounded-2xl border bg-card p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-bold">
                      {index + 1}
                    </span>
                    <h2 className="text-base font-bold">{section.label}</h2>
                    {!section.known ? (
                      <Badge variant="destructive">قسم غير معروف</Badge>
                    ) : null}
                    {FRAMING_ONLY_KEYS.has(section.sectionKey) ? (
                      <Badge variant="outline">تلقائي</Badge>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={draft.isEnabled}
                        onCheckedChange={(v) => setDraft(section.id, { isEnabled: v })}
                        aria-label={`تشغيل/إخفاء ${section.label}`}
                      />
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {draft.isEnabled ? (
                          <>
                            <Eye aria-hidden className="size-3.5" /> ظاهر
                          </>
                        ) : (
                          <>
                            <EyeOff aria-hidden className="size-3.5" /> مخفي
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === 0 || busy}
                        onClick={() => moveSection(index, -1)}
                        aria-label={`تحريك ${section.label} للأعلى`}
                      >
                        <ArrowUp aria-hidden className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === sections.length - 1 || busy}
                        onClick={() => moveSection(index, 1)}
                        aria-label={`تحريك ${section.label} للأسفل`}
                      >
                        <ArrowDown aria-hidden className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`title-${section.id}`}>العنوان (اختياري)</Label>
                    <Input
                      id={`title-${section.id}`}
                      value={draft.title ?? ''}
                      placeholder="افتراضي من المتجر"
                      onChange={(e) => setDraft(section.id, { title: e.target.value })}
                      maxLength={120}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`subtitle-${section.id}`}>الوصف (اختياري)</Label>
                    <Input
                      id={`subtitle-${section.id}`}
                      value={draft.subtitle ?? ''}
                      placeholder="افتراضي من المتجر"
                      onChange={(e) => setDraft(section.id, { subtitle: e.target.value })}
                      maxLength={240}
                    />
                  </div>
                </div>

                {/* Per-key config editors */}
                {section.sectionKey === 'announcement' ? (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <Label htmlFor={`cfg-message-${section.id}`}>نص شريط الإعلانات</Label>
                    <Input
                      id={`cfg-message-${section.id}`}
                      value={typeof config.message === 'string' ? config.message : ''}
                      placeholder="النص الافتراضي: الدفع عند الاستلام متاح…"
                      onChange={(e) => setConfig({ message: e.target.value })}
                      maxLength={300}
                    />
                  </div>
                ) : null}

                {section.sectionKey === 'hero' ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`cfg-title-${section.id}`}>العنوان الرئيسي</Label>
                      <Input
                        id={`cfg-title-${section.id}`}
                        value={typeof config.title === 'string' ? config.title : ''}
                        onChange={(e) => setConfig({ title: e.target.value })}
                        maxLength={80}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`cfg-subtitle-${section.id}`}>النص الفرعي</Label>
                      <Input
                        id={`cfg-subtitle-${section.id}`}
                        value={typeof config.subtitle === 'string' ? config.subtitle : ''}
                        onChange={(e) => setConfig({ subtitle: e.target.value })}
                        maxLength={240}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`cfg-cta-${section.id}`}>نص زر الدعوة</Label>
                      <Input
                        id={`cfg-cta-${section.id}`}
                        value={typeof config.ctaLabel === 'string' ? config.ctaLabel : ''}
                        onChange={(e) => setConfig({ ctaLabel: e.target.value })}
                        maxLength={40}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`cfg-href-${section.id}`}>
                        رابط الدعوة (مسار داخلي أو واتساب)
                      </Label>
                      <Input
                        id={`cfg-href-${section.id}`}
                        dir="ltr"
                        value={typeof config.ctaHref === 'string' ? config.ctaHref : ''}
                        placeholder="/category/women"
                        onChange={(e) => setConfig({ ctaHref: e.target.value })}
                        maxLength={300}
                      />
                    </div>
                  </div>
                ) : null}

                {section.sectionKey === 'whatsapp_cta' ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`cfg-wtitle-${section.id}`}>عنوان الدعوة</Label>
                      <Input
                        id={`cfg-wtitle-${section.id}`}
                        value={typeof config.title === 'string' ? config.title : ''}
                        onChange={(e) => setConfig({ title: e.target.value })}
                        maxLength={80}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`cfg-wbody-${section.id}`}>النص</Label>
                      <Input
                        id={`cfg-wbody-${section.id}`}
                        value={typeof config.body === 'string' ? config.body : ''}
                        onChange={(e) => setConfig({ body: e.target.value })}
                        maxLength={200}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label htmlFor={`cfg-wlabel-${section.id}`}>نص الزر</Label>
                      <Input
                        id={`cfg-wlabel-${section.id}`}
                        value={typeof config.ctaLabel === 'string' ? config.ctaLabel : ''}
                        onChange={(e) => setConfig({ ctaLabel: e.target.value })}
                        maxLength={40}
                      />
                    </div>
                  </div>
                ) : null}

                {section.sectionKey === 'brand_story' ? (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <Label htmlFor={`cfg-body-${section.id}`}>نص قصتنا</Label>
                    <Textarea
                      id={`cfg-body-${section.id}`}
                      rows={4}
                      value={typeof config.body === 'string' ? config.body : ''}
                      onChange={(e) => setConfig({ body: e.target.value })}
                      maxLength={600}
                    />
                  </div>
                ) : null}

                {section.sectionKey === 'benefits' ? (
                  <div className="mt-3 flex flex-col gap-3">
                    {(Array.isArray(config.items) ? config.items : []).map(
                      (item, i) => {
                        const entry = (item ?? {}) as Record<string, unknown>;
                        return (
                          <fieldset
                            key={i}
                            className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_2fr]"
                          >
                            <legend className="px-1 text-xs text-muted-foreground">
                              ميزة {i + 1}
                            </legend>
                            <Input
                              value={typeof entry.title === 'string' ? entry.title : ''}
                              placeholder="العنوان"
                              aria-label={`عنوان الميزة ${i + 1}`}
                              maxLength={80}
                              onChange={(e) => {
                                const items = (Array.isArray(config.items)
                                  ? [...config.items]
                                  : []) as Record<string, unknown>[];
                                items[i] = { ...entry, title: e.target.value };
                                setConfig({ items });
                              }}
                            />
                            <Input
                              value={typeof entry.description === 'string' ? entry.description : ''}
                              placeholder="الوصف"
                              aria-label={`وصف الميزة ${i + 1}`}
                              maxLength={200}
                              onChange={(e) => {
                                const items = (Array.isArray(config.items)
                                  ? [...config.items]
                                  : []) as Record<string, unknown>[];
                                items[i] = { ...entry, description: e.target.value };
                                setConfig({ items });
                              }}
                            />
                          </fieldset>
                        );
                      },
                    )}
                  </div>
                ) : null}

                <div className="mt-4 flex justify-start">
                  <Button size="sm" disabled={busy} onClick={() => saveSection(section.id)}>
                    {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
                    حفظ القسم
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ------------------------------------------------- Banners panel -- */}
      <BannersPanel banners={banners} onRefresh={refresh} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Banners                                                                     */
/* -------------------------------------------------------------------------- */

/** ISO → datetime-local input value (local time, minutes precision). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type BannerEditState = {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  startsAt: string;
  endsAt: string;
};

function bannerToEditState(banner: BannerRow): BannerEditState {
  return {
    title: banner.title,
    subtitle: banner.subtitle ?? '',
    ctaLabel: banner.ctaLabel ?? '',
    ctaHref: banner.ctaHref ?? '',
    startsAt: toLocalInput(banner.startsAt),
    endsAt: toLocalInput(banner.endsAt),
  };
}

function BannersPanel({
  banners,
  onRefresh,
}: {
  banners: BannerRow[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    ctaLabel: '',
    ctaHref: '',
  });
  const [file, setFile] = useState<File | null>(null);
  // PHASE-12: full banner editing (copy + CTA + schedule) and reordering.
  const [editing, setEditing] = useState<BannerRow | null>(null);
  const [editForm, setEditForm] = useState<BannerEditState | null>(null);

  async function createBanner() {
    if (!file) {
      toast({ title: 'اختر صورة البانر أولًا.', variant: 'destructive' });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast({
        title: 'حجم الصورة يتجاوز الحد الأقصى (٤ ميغابايت).',
        variant: 'destructive',
      });
      return;
    }
    if (!form.title.trim()) {
      toast({ title: 'عنوان البانر مطلوب.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('title', form.title);
      if (form.subtitle.trim()) body.set('subtitle', form.subtitle);
      if (form.ctaLabel.trim()) body.set('ctaLabel', form.ctaLabel);
      if (form.ctaHref.trim()) body.set('ctaHref', form.ctaHref);

      const response = await fetch('/api/admin/homepage/banners', {
        method: 'POST',
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast({ title: payload?.error ?? 'تعذر إنشاء البانر.', variant: 'destructive' });
        return;
      }
      toast({ title: 'تم إنشاء البانر (غير مفعّل) — فعّله لعرضه.' });
      setForm({ title: '', subtitle: '', ctaLabel: '', ctaHref: '' });
      setFile(null);
      onRefresh();
    } finally {
      setUploading(false);
    }
  }

  async function patchBanner(id: string, body: Record<string, unknown>, successTitle?: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/homepage/banners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast({ title: payload?.error ?? 'تعذر تحديث البانر.', variant: 'destructive' });
        return false;
      }
      if (successTitle) toast({ title: successTitle });
      onRefresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function deleteBanner(id: string) {
    const confirmed = window.confirm(
      'حذف البانر نهائيًا؟ تبقى صورته في مكتبة الوسائط (يُرفض حذفها وهي مرجوعة).',
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/homepage/banners/${id}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast({ title: payload?.error ?? 'تعذر حذف البانر.', variant: 'destructive' });
        return;
      }
      toast({ title: 'تم حذف البانر.' });
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  /** Reorder by swapping this banner's sortOrder with its neighbor (two PATCHes). */
  async function reorder(index: number, direction: -1 | 1) {
    const neighborIndex = index + direction;
    if (neighborIndex < 0 || neighborIndex >= banners.length) return;
    const current = banners[index]!;
    const neighbor = banners[neighborIndex]!;
    setBusy(true);
    try {
      // Detach through a temporary value first to dodge a transient equal-sortOrder state.
      const okCurrent = await patchBanner(current.id, { sortOrder: -1 });
      if (!okCurrent) return;
      const okNeighbor = await patchBanner(neighbor.id, { sortOrder: current.sortOrder });
      if (!okNeighbor) return;
      await patchBanner(current.id, { sortOrder: neighbor.sortOrder }, 'تم تحديث الترتيب.');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing || !editForm) return;
    if (!editForm.title.trim()) {
      toast({ title: 'عنوان البانر مطلوب.', variant: 'destructive' });
      return;
    }
    if (editForm.startsAt && editForm.endsAt && editForm.startsAt > editForm.endsAt) {
      toast({ title: 'تاريخ البداية يجب أن يسبق تاريخ النهاية.', variant: 'destructive' });
      return;
    }
    const ok = await patchBanner(
      editing.id,
      {
        title: editForm.title.trim(),
        subtitle: editForm.subtitle.trim() || null,
        ctaLabel: editForm.ctaLabel.trim() || null,
        ctaHref: editForm.ctaHref.trim() || null,
        startsAt: editForm.startsAt ? new Date(editForm.startsAt).toISOString() : null,
        endsAt: editForm.endsAt ? new Date(editForm.endsAt).toISOString() : null,
      },
      'تم حفظ تعديلات البانر.',
    );
    if (ok) setEditing(null);
  }

  return (
    <section aria-labelledby="banners-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="banners-heading" className="text-xl font-extrabold">
          بانرات الواجهة (Hero)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          صور إعلانية تظهر في أعلى الصفحة الرئيسية. تُحفظ الصور كوسائط عامة،
          ويبقى البانر غير مفعّل حتى تقوم بتفعيله. يمكنك تعديل النصوص ونافذة
          العرض وترتيب البانرات من هنا.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="banner-title">عنوان البانر</Label>
            <Input
              id="banner-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="banner-subtitle">النص الفرعي (اختياري)</Label>
            <Input
              id="banner-subtitle"
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              maxLength={240}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="banner-cta-label">نص زر الدعوة (اختياري)</Label>
            <Input
              id="banner-cta-label"
              value={form.ctaLabel}
              onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
              maxLength={40}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="banner-cta-href">
              رابط الدعوة (اختياري — مسار داخلي أو واتساب)
            </Label>
            <Input
              id="banner-cta-href"
              dir="ltr"
              value={form.ctaHref}
              placeholder="/category/women"
              onChange={(e) => setForm({ ...form, ctaHref: e.target.value })}
              maxLength={300}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="banner-file">صورة البانر</Label>
            <Input
              id="banner-file"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">حتى ٤ ميغابايت.</p>
          </div>
        </div>
        <div className="mt-4">
          <Button disabled={uploading} onClick={createBanner}>
            {uploading ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Plus aria-hidden className="size-4" />
            )}
            إضافة البانر
          </Button>
        </div>
      </div>

      {banners.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          لا توجد بانرات بعد — تُعرض الواجهة الافتراضية للبانر الرئيسي.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {banners.map((banner, index) => (
            <li
              key={banner.id}
              className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center"
            >
              <img
                src={banner.mediaUrl}
                alt={banner.title}
                width={96}
                height={64}
                className="h-16 w-24 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-bold">{banner.title}</h3>
                  <Badge variant={banner.isActive ? 'default' : 'outline'}>
                    {banner.isActive ? 'مفعّل' : 'غير مفعّل'}
                  </Badge>
                  <Badge variant="outline" className="bg-card">
                    الترتيب: {banner.sortOrder}
                  </Badge>
                  {banner.startsAt || banner.endsAt ? (
                    <Badge variant="outline" className="bg-card">
                      نافذة عرض مجدولة
                    </Badge>
                  ) : null}
                </div>
                {banner.subtitle ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {banner.subtitle}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Switch
                  checked={banner.isActive}
                  disabled={busy}
                  onCheckedChange={(v) => patchBanner(banner.id, { isActive: v })}
                  aria-label={`تفعيل/تعطيل ${banner.title}`}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  disabled={busy || index === 0}
                  onClick={() => reorder(index, -1)}
                  aria-label={`تحريك ${banner.title} للأعلى`}
                >
                  <ArrowUp aria-hidden className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  disabled={busy || index === banners.length - 1}
                  onClick={() => reorder(index, 1)}
                  aria-label={`تحريك ${banner.title} للأسفل`}
                >
                  <ArrowDown aria-hidden className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  disabled={busy}
                  onClick={() => {
                    setEditing(banner);
                    setEditForm(bannerToEditState(banner));
                  }}
                  aria-label={`تحرير ${banner.title}`}
                >
                  <Pencil aria-hidden className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 text-destructive"
                  disabled={busy}
                  onClick={() => deleteBanner(banner.id)}
                  aria-label={`حذف ${banner.title}`}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تحرير البانر</DialogTitle>
            <DialogDescription>
              عدّل النصوص وزر الدعوة ونافذة العرض. الحقول الفارغة تُحفظ كقيم
              فارغة (بدون نص/بدون جدولة).
            </DialogDescription>
          </DialogHeader>
          {editForm ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="banner-edit-title">العنوان</Label>
                <Input
                  id="banner-edit-title"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  maxLength={120}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="banner-edit-subtitle">النص الفرعي</Label>
                <Input
                  id="banner-edit-subtitle"
                  value={editForm.subtitle}
                  onChange={(e) => setEditForm({ ...editForm, subtitle: e.target.value })}
                  maxLength={240}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-edit-cta-label">نص زر الدعوة</Label>
                <Input
                  id="banner-edit-cta-label"
                  value={editForm.ctaLabel}
                  onChange={(e) => setEditForm({ ...editForm, ctaLabel: e.target.value })}
                  maxLength={40}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-edit-cta-href">رابط الدعوة (مسار داخلي أو واتساب)</Label>
                <Input
                  id="banner-edit-cta-href"
                  dir="ltr"
                  value={editForm.ctaHref}
                  placeholder="/category/women"
                  onChange={(e) => setEditForm({ ...editForm, ctaHref: e.target.value })}
                  maxLength={300}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-edit-starts">بداية العرض (اختياري)</Label>
                <Input
                  id="banner-edit-starts"
                  type="datetime-local"
                  value={editForm.startsAt}
                  onChange={(e) => setEditForm({ ...editForm, startsAt: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-edit-ends">نهاية العرض (اختياري)</Label>
                <Input
                  id="banner-edit-ends"
                  type="datetime-local"
                  value={editForm.endsAt}
                  onChange={(e) => setEditForm({ ...editForm, endsAt: e.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              إلغاء
            </Button>
            <Button onClick={saveEdit} disabled={busy} className="gap-2">
              {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
