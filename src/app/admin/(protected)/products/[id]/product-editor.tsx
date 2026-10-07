'use client';

/**
 * Product editor (PHASE-04 tasks 2, 4–8, 11–14).
 *
 * Key behaviors (matching the phase's critical UI checks):
 * - size-only / color-only / no-option / size+color editors all work by
 *   simply selecting which attributes the product uses — nothing is forced;
 * - variants are EXPLICIT rows the admin adds — no matrix is ever
 *   auto-generated (the optional "fill missing combinations" helper creates
 *   editable rows on demand only);
 * - different variants can hold different prices (per-row price inputs);
 * - a zero-stock variant is saved with stock 0 (storefront purchasability is
 *   enforced later at checkout — the editor preserves the zero);
 * - per-variant image assignment updates which images belong to a variant.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { AssetImage } from '@/components/admin/asset-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

import {
  buildPayload,
  type EditorAttribute,
  type EditorImage,
  type EditorMediaAsset,
  type EditorProduct,
  type EditorSizeGuide,
  type EditorVariant,
} from './editor-state';
import {
  AttributesPicker,
  GalleryEditor,
  SizeGuideEditor,
  VariantsEditor,
} from './editor-sections';

const STATUS_LABEL: Record<EditorProduct['status'], string> = {
  draft: 'مسودة',
  active: 'نشط',
  archived: 'مؤرشف',
};

export function ProductEditor({
  aggregate,
  categories,
  attributes: initialAttributes,
  mediaAssets: initialMedia,
  uploadConfigured,
}: {
  aggregate: {
    product: EditorProduct;
    variants: EditorVariant[];
    images: EditorImage[];
    sizeGuide: EditorSizeGuide | null;
  };
  categories: Array<{ id: string; label: string }>;
  attributes: EditorAttribute[];
  mediaAssets: EditorMediaAsset[];
  uploadConfigured: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [product, setProduct] = useState<EditorProduct>(aggregate.product);
  const [attributeIds, setAttributeIds] = useState<string[]>(
    deduceAttributeIds(aggregate.variants),
  );
  const [attributes, setAttributes] = useState<EditorAttribute[]>(initialAttributes);
  const [variants, setVariants] = useState<EditorVariant[]>(aggregate.variants);
  const [images, setImages] = useState<EditorImage[]>(aggregate.images);
  const [sizeGuide, setSizeGuide] = useState<EditorSizeGuide | null>(aggregate.sizeGuide);
  const [mediaAssets, setMediaAssets] = useState<EditorMediaAsset[]>(initialMedia);

  // After a save triggers router.refresh(), the server re-renders this page
  // and passes a NEW aggregate object (persisted variant ids, gallery, etc.).
  // Resync editor state to the persisted truth so the next save diffs against
  // reality — otherwise stale `id: null` rows would re-submit already-created
  // variants as new ones. (Client-side re-renders reuse the same props object,
  // so this effect only fires on genuine server refreshes.)
  const lastServerAggregate = useRef(aggregate);
  useEffect(() => {
    if (aggregate !== lastServerAggregate.current) {
      lastServerAggregate.current = aggregate;
      setProduct(aggregate.product);
      setVariants(aggregate.variants);
      setImages(aggregate.images);
      setSizeGuide(aggregate.sizeGuide);
      setAttributeIds(deduceAttributeIds(aggregate.variants));
    }
  }, [aggregate]);

  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const selectedAttributes = attributeIds
    .map((id) => attributes.find((attribute) => attribute.id === id))
    .filter((attribute): attribute is EditorAttribute => Boolean(attribute));

  async function uploadFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    const uploaded: EditorMediaAsset[] = [];
    for (const file of Array.from(files).slice(0, 10)) {
      if (file.size > 4 * 1024 * 1024) {
        toast({
          title: `تعذر رفع: ${file.name}`,
          description: 'حجم الصورة يتجاوز الحد الأقصى (٤ ميغابايت).',
          variant: 'destructive',
        });
        continue;
      }
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/admin/media/upload', { method: 'POST', body: form });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        asset?: { id: string; url: string; mimeType: string; altText: string | null };
      };
      if (response.ok && data.ok && data.asset) {
        uploaded.push(data.asset);
      } else {
        toast({
          title: `تعذر رفع: ${file.name}`,
          description: data.error ?? 'خطأ غير متوقع.',
          variant: 'destructive',
        });
      }
    }
    if (uploaded.length > 0) {
      setMediaAssets((prev) => [...uploaded, ...prev]);
      toast({ title: `تم رفع ${uploaded.length} صورة — أرفقها من المكتبة` });
    }
  }

  async function save(): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildPayload({ product, attributeIds, variants, images, sizeGuide }),
        ),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (response.ok && data.ok) {
        toast({ title: 'تم حفظ المنتج' });
        router.refresh();
        return true;
      }
      toast({
        title: 'تعذر الحفظ',
        description: data.error ?? 'خطأ غير متوقع.',
        variant: 'destructive',
      });
      return false;
    } catch {
      toast({
        title: 'تعذر الاتصال بالخادم',
        description: 'تحقق من الشبكة وحاول مرة أخرى.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: EditorProduct['status']) {
    if (statusBusy || status === product.status) return;
    setStatusBusy(true);
    const response = await fetch(`/api/admin/products/${product.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setStatusBusy(false);
    if (response.ok) {
      setProduct((prev) => ({ ...prev, status }));
      toast({ title: `الحالة الآن: ${STATUS_LABEL[status]}` });
      router.refresh();
    } else {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      toast({ title: 'تعذر تغيير الحالة', description: data.error, variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{product.name}</h1>
            <Badge variant="outline">{STATUS_LABEL[product.status]}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
            /product/{product.slug}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={product.status}
            onValueChange={(value) => changeStatus(value as EditorProduct['status'])}
          >
            <SelectTrigger className="h-10 w-36" aria-label="حالة المنتج">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="archived">مؤرشف</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={save} disabled={saving} className="h-10 gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            حفظ التغييرات
          </Button>
        </div>
      </div>

      {/* basics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">البيانات الأساسية</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pe-name">اسم المنتج</Label>
            <Input
              id="pe-name"
              value={product.name}
              onChange={(event) => setProduct((prev) => ({ ...prev, name: event.target.value }))}
              className="h-11"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pe-category">القسم</Label>
            <Select
              value={product.categoryId}
              onValueChange={(value) => setProduct((prev) => ({ ...prev, categoryId: value }))}
            >
              <SelectTrigger id="pe-category" className="h-11">
                <SelectValue />
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
          <div className="space-y-2">
            <Label htmlFor="pe-slug">الرابط (slug)</Label>
            <Input
              id="pe-slug"
              dir="ltr"
              value={product.slug}
              onChange={(event) => setProduct((prev) => ({ ...prev, slug: event.target.value }))}
              className="h-11"
              maxLength={120}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pe-short">وصف مختصر</Label>
            <Textarea
              id="pe-short"
              value={product.shortDescription ?? ''}
              onChange={(event) =>
                setProduct((prev) => ({ ...prev, shortDescription: event.target.value }))
              }
              rows={2}
              maxLength={1000}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pe-description">الوصف الكامل</Label>
            <Textarea
              id="pe-description"
              value={product.description ?? ''}
              onChange={(event) =>
                setProduct((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={5}
              maxLength={20000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pe-meta-title">عنوان SEO</Label>
            <Input
              id="pe-meta-title"
              value={product.metaTitle ?? ''}
              onChange={(event) =>
                setProduct((prev) => ({ ...prev, metaTitle: event.target.value }))
              }
              className="h-11"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pe-meta-description">وصف SEO</Label>
            <Input
              id="pe-meta-description"
              value={product.metaDescription ?? ''}
              onChange={(event) =>
                setProduct((prev) => ({ ...prev, metaDescription: event.target.value }))
              }
              className="h-11"
              maxLength={500}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pe-canonical-slug">
              الرابط الأساسي (canonical) — اختياري
            </Label>
            <Input
              id="pe-canonical-slug"
              dir="ltr"
              value={product.canonicalSlug ?? ''}
              onChange={(event) =>
                setProduct((prev) => ({ ...prev, canonicalSlug: event.target.value }))
              }
              className="h-11"
              maxLength={120}
              placeholder="/product/women-dress-blue"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              اتركه فارغًا ليتبع الرابط الأساسي مسار المنتج تلقائيًا. عند
              إدخاله يجب أن يكون حروفًا/أرقامًا وشرطات فقط وغير مستخدم لمنتج
              آخر.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* attributes */}
      <AttributesPicker
        attributes={attributes}
        selectedIds={attributeIds}
        onChange={setAttributeIds}
        onAttributesChanged={(updated) => setAttributes(updated)}
        toast={toast}
      />

      {/* variants */}
      <VariantsEditor
        attributes={selectedAttributes}
        variants={variants}
        setVariants={setVariants}
        attributeIds={attributeIds}
      />

      {/* gallery */}
      <GalleryEditor
        images={images}
        setImages={setImages}
        variants={variants}
        mediaAssets={mediaAssets}
        uploadConfigured={uploadConfigured}
        onUpload={uploadFiles}
      />

      {/* size guide */}
      <SizeGuideEditor sizeGuide={sizeGuide} onChange={setSizeGuide} />

      {/* sticky save bar (mobile-friendly) */}
      <div className="sticky bottom-4 z-10 rounded-2xl border bg-card/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            الحفظ يتحقق من الأسعار وتركيبات المتغيرات على الخادم قبل التطبيق.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() =>
                changeStatus(product.status === 'active' ? 'archived' : 'active')
              }
              disabled={statusBusy}
            >
              {product.status === 'active' ? 'أرشفة' : 'تنشيط'}
            </Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              حفظ التغييرات
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function deduceAttributeIds(variants: EditorVariant[]): string[] {
  const ids = new Set<string>();
  for (const variant of variants) {
    for (const attributeId of Object.keys(variant.values)) {
      if (variant.values[attributeId]) ids.add(attributeId);
    }
  }
  return [...ids];
}
