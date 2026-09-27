'use client';

/**
 * Product editor sections (PHASE-04):
 * - AttributesPicker: choose the generic attributes a product uses + inline
 *   attribute/value creation (tasks 3 & 5);
 * - VariantsEditor: EXPLICIT variant rows with per-row SKU/prices/stock/
 *   threshold/active + one select per attribute (tasks 4–7) — nothing is
 *   auto-generated; the fill-missing helper is explicit and editable;
 * - GalleryEditor: gallery + per-variant images with ordering/primary/alt
 *   (tasks 8 & 11);
 * - SizeGuideEditor: optional clothing size guide rows (task 12).
 */

import { useMemo, useState } from 'react';
import {
  Loader2,
  Plus,
  Shirt,
  Sparkles,
  Trash2,
  X,
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
import { useToast } from '@/hooks/use-toast';

import type {
  EditorAttribute,
  EditorImage,
  EditorMediaAsset,
  EditorSizeGuide,
  EditorVariant,
} from './editor-state';

type ToastFn = ReturnType<typeof useToast>['toast'];

/* -------------------------------------------------------------------------- */
/* Attributes picker                                                           */
/* -------------------------------------------------------------------------- */

export function AttributesPicker({
  attributes,
  selectedIds,
  onChange,
  onAttributesChanged,
  toast,
}: {
  attributes: EditorAttribute[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onAttributesChanged: (attributes: EditorAttribute[]) => void;
  toast: ToastFn;
}) {
  const [newAttributeName, setNewAttributeName] = useState('');
  const [creating, setCreating] = useState(false);
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});
  const [addingValueFor, setAddingValueFor] = useState<string | null>(null);

  function toggle(attributeId: string) {
    if (selectedIds.includes(attributeId)) {
      onChange(selectedIds.filter((id) => id !== attributeId));
    } else {
      onChange([...selectedIds, attributeId]);
    }
  }

  async function createAttribute() {
    const name = newAttributeName.trim();
    if (name.length < 2 || creating) return;
    setCreating(true);
    const response = await fetch('/api/admin/attributes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      attribute?: { id: string; slug: string };
    };
    setCreating(false);
    if (response.ok && data.ok && data.attribute) {
      const created: EditorAttribute = {
        id: data.attribute.id,
        name,
        values: [],
      };
      onAttributesChanged([...attributes, created]);
      onChange([...selectedIds, created.id]);
      setNewAttributeName('');
      toast({ title: 'تم إنشاء الخاصية وتفعيلها للمنتج' });
    } else {
      toast({ title: 'تعذر إنشاء الخاصية', description: data.error, variant: 'destructive' });
    }
  }

  async function addValue(attributeId: string) {
    const value = (valueDrafts[attributeId] ?? '').trim();
    if (value.length === 0 || addingValueFor !== null) return;
    setAddingValueFor(attributeId);
    const response = await fetch(`/api/admin/attributes/${attributeId}/values`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      value?: { id: string; value: string };
    };
    setAddingValueFor(null);
    if (response.ok && data.ok && data.value) {
      onAttributesChanged(
        attributes.map((attribute) =>
          attribute.id === attributeId
            ? {
                ...attribute,
                values: [...attribute.values, { id: data.value!.id, value: data.value!.value }],
              }
            : attribute,
        ),
      );
      setValueDrafts((prev) => ({ ...prev, [attributeId]: '' }));
    } else {
      toast({ title: 'تعذر إضافة القيمة', description: data.error, variant: 'destructive' });
    }
  }

  async function deleteValue(attributeId: string, valueId: string) {
    const response = await fetch(`/api/admin/attribute-values/${valueId}`, {
      method: 'DELETE',
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.ok) {
      onAttributesChanged(
        attributes.map((attribute) =>
          attribute.id === attributeId
            ? {
                ...attribute,
                values: attribute.values.filter((value) => value.id !== valueId),
              }
            : attribute,
        ),
      );
    } else {
      toast({ title: 'تعذر حذف القيمة', description: data.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">خصائص المنتج (اختياري)</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          فعّل الخصائص التي يحتاجها المنتج فقط (مثل المقاس أو اللون). المنتج
          بدون خصائص يُباع بمتغير افتراضي واحد.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {attributes.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد خصائص معرفة بعد.</p>
          ) : (
            attributes.map((attribute) => {
              const checked = selectedIds.includes(attribute.id);
              return (
                <div
                  key={attribute.id}
                  className={`rounded-xl border p-3 transition-colors ${
                    checked ? 'border-primary/50 bg-primary/5' : 'bg-background'
                  }`}
                >
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(attribute.id)}
                      className="h-4 w-4 accent-[var(--primary)]"
                      aria-label={`استخدام خاصية ${attribute.name}`}
                    />
                    <span className="text-sm font-semibold text-foreground">{attribute.name}</span>
                  </label>
                  {checked ? (
                    <div className="mt-2 space-y-2 border-t pt-2">
                      <div className="flex flex-wrap gap-1.5">
                        {attribute.values.map((value) => (
                          <Badge key={value.id} variant="outline" className="gap-1">
                            {value.value}
                            <button
                              type="button"
                              aria-label={`حذف قيمة ${value.value}`}
                              onClick={() => deleteValue(attribute.id, value.id)}
                              className="text-muted-foreground transition-colors hover:text-destructive"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </Badge>
                        ))}
                        {attribute.values.length === 0 ? (
                          <span className="text-xs text-muted-foreground">لا قيم بعد</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={valueDrafts[attribute.id] ?? ''}
                          onChange={(event) =>
                            setValueDrafts((prev) => ({
                              ...prev,
                              [attribute.id]: event.target.value,
                            }))
                          }
                          placeholder={`قيمة جديدة لـ ${attribute.name}`}
                          className="h-9 max-w-48"
                          maxLength={80}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={addingValueFor !== null}
                          onClick={() => addValue(attribute.id)}
                        >
                          {addingValueFor === attribute.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          إضافة قيمة
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-2 border-t pt-3">
          <Input
            value={newAttributeName}
            onChange={(event) => setNewAttributeName(event.target.value)}
            placeholder="خاصية جديدة (مثل: خامة، ستايل…)"
            className="h-10 max-w-64"
            maxLength={60}
          />
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={creating || newAttributeName.trim().length < 2}
            onClick={createAttribute}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            إنشاء خاصية
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Variants editor                                                             */
/* -------------------------------------------------------------------------- */

let newVariantCounter = 0;

export function VariantsEditor({
  attributes,
  variants,
  setVariants,
  attributeIds,
}: {
  attributes: EditorAttribute[];
  variants: EditorVariant[];
  setVariants: React.Dispatch<React.SetStateAction<EditorVariant[]>>;
  attributeIds: string[];
}) {
  const { toast } = useToast();

  const duplicateComboKeys = useMemo(() => {
    const seen = new Map<string, number>();
    const duplicates = new Set<string>();
    for (const variant of variants) {
      const key = attributeIds
        .map((id) => variant.values[id] ?? '')
        .filter(Boolean)
        .sort()
        .join('|');
      if (!key) continue;
      if (seen.has(key)) duplicates.add(variant.clientKey);
      seen.set(key, seen.size);
    }
    return duplicates;
  }, [variants, attributeIds]);

  function addVariant() {
    newVariantCounter += 1;
    const clientKey = `new-${Date.now()}-${newVariantCounter}`;
    const template = variants[0];
    setVariants((prev) => [
      ...prev,
      {
        clientKey,
        id: null,
        sku: '',
        originalPrice: template?.originalPrice ?? '',
        currentPrice: template?.currentPrice ?? '',
        stockQuantity: 0,
        lowStockThreshold: template?.lowStockThreshold ?? 3,
        isActive: true,
        values: Object.fromEntries(attributeIds.map((id) => [id, ''])),
      },
    ]);
  }

  function removeVariant(clientKey: string) {
    setVariants((prev) => prev.filter((variant) => variant.clientKey !== clientKey));
  }

  function updateVariant(clientKey: string, patch: Partial<EditorVariant>) {
    setVariants((prev) =>
      prev.map((variant) =>
        variant.clientKey === clientKey ? { ...variant, ...patch } : variant,
      ),
    );
  }

  /**
   * Explicit opt-in helper: fills in the missing combinations of the current
   * attribute values as EDITABLE rows. Nothing is forced or auto-saved.
   */
  function generateMissingCombinations() {
    if (attributes.length === 0) return;
    const existing = new Set(
      variants.map((variant) =>
        attributeIds
          .map((id) => variant.values[id] ?? '')
          .filter(Boolean)
          .sort()
          .join('|'),
      ),
    );
    let combos: string[][] = [[]];
    for (const attribute of attributes) {
      const next: string[][] = [];
      for (const partial of combos) {
        for (const value of attribute.values) {
          next.push([...partial, value.id]);
        }
      }
      combos = next;
      if (combos.length > 200) break; // sanity cap
    }
    const missing = combos.filter(
      (ids) => !existing.has([...ids].sort().join('|')),
    );
    if (missing.length === 0) {
      toast({ title: 'كل التركيبات الممكنة موجودة بالفعل' });
      return;
    }
    if (variants.length + missing.length > 100) {
      toast({
        title: 'عدد التركيبات يتجاوز الحد الأقصى (١٠٠ متغير)',
        variant: 'destructive',
      });
      return;
    }
    const template = variants[0];
    const created: EditorVariant[] = missing.map((ids) => {
      newVariantCounter += 1;
      return {
        clientKey: `new-${Date.now()}-${newVariantCounter}`,
        id: null,
        sku: `V${newVariantCounter}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        originalPrice: template?.originalPrice ?? '',
        currentPrice: template?.currentPrice ?? '',
        stockQuantity: 0,
        lowStockThreshold: template?.lowStockThreshold ?? 3,
        isActive: true,
        values: Object.fromEntries(
          attributes.map((attribute, index) => [attribute.id, ids[index]]),
        ),
      };
    });
    setVariants((prev) => [...prev, ...created]);
    toast({ title: `أُضيفت ${created.length} تركيبة — عدّل الأسعار والمخزون` });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">المتغيرات (وحدات البيع)</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              كل متغير يُحدَّد صراحةً — لا توليد تلقائي. يمكن أن يختلف السعر
              والمخزون لكل متغير.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {attributes.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={generateMissingCombinations}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                إكمال التركيبات الناقصة
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addVariant}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              متغير
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {variants.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            أضف متغيرًا واحدًا على الأقل.
          </p>
        ) : (
          <ul className="space-y-3">
            {variants.map((variant) => (
              <li
                key={variant.clientKey}
                className="rounded-xl border bg-background p-3"
              >
                <div className="flex flex-wrap items-end gap-3">
                  {attributes.map((attribute) => (
                    <div key={attribute.id} className="min-w-32 space-y-1">
                      <Label className="text-xs text-muted-foreground">{attribute.name}</Label>
                      <Select
                        value={variant.values[attribute.id] ?? ''}
                        onValueChange={(value) =>
                          updateVariant(variant.clientKey, {
                            values: { ...variant.values, [attribute.id]: value },
                          })
                        }
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue placeholder="اختر" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {attribute.values.map((value) => (
                            <SelectItem key={value.id} value={value.id}>
                              {value.value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}

                  <div className="min-w-36 space-y-1">
                    <Label className="text-xs text-muted-foreground">SKU</Label>
                    <Input
                      dir="ltr"
                      aria-label="رمز SKU للمتغير"
                      value={variant.sku}
                      onChange={(event) =>
                        updateVariant(variant.clientKey, { sku: event.target.value.toUpperCase() })
                      }
                      maxLength={80}
                      className="h-10"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs text-muted-foreground">السعر الأصلي</Label>
                    <Input
                      dir="ltr"
                      aria-label="السعر الأصلي للمتغير"
                      inputMode="decimal"
                      value={variant.originalPrice}
                      onChange={(event) =>
                        updateVariant(variant.clientKey, { originalPrice: event.target.value })
                      }
                      className="h-10"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs text-muted-foreground">السعر الحالي</Label>
                    <Input
                      dir="ltr"
                      aria-label="السعر الحالي للمتغير"
                      inputMode="decimal"
                      value={variant.currentPrice}
                      onChange={(event) =>
                        updateVariant(variant.clientKey, { currentPrice: event.target.value })
                      }
                      className="h-10"
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs text-muted-foreground">المخزون</Label>
                    <Input
                      dir="ltr"
                      aria-label="المخزون للمتغير"
                      inputMode="numeric"
                      value={Number.isFinite(variant.stockQuantity) ? variant.stockQuantity : 0}
                      onChange={(event) =>
                        updateVariant(variant.clientKey, {
                          stockQuantity: Number(event.target.value) || 0,
                        })
                      }
                      className="h-10"
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs text-muted-foreground">حد التنبيه</Label>
                    <Input
                      dir="ltr"
                      aria-label="حد التنبيه للمتغير"
                      inputMode="numeric"
                      value={
                        Number.isFinite(variant.lowStockThreshold) ? variant.lowStockThreshold : 3
                      }
                      onChange={(event) =>
                        updateVariant(variant.clientKey, {
                          lowStockThreshold: Number(event.target.value) || 0,
                        })
                      }
                      className="h-10"
                    />
                  </div>
                  <div className="flex h-10 items-center gap-2 rounded-xl border px-3">
                    <Label className="text-xs text-muted-foreground">نشط</Label>
                    <input
                      type="hidden"
                      value={variant.isActive ? 'on' : 'off'}
                      readOnly
                      aria-hidden="true"
                    />
                    <Switch
                      checked={variant.isActive}
                      onCheckedChange={(checked) =>
                        updateVariant(variant.clientKey, { isActive: checked })
                      }
                      aria-label={`تفعيل المتغير ${variant.sku}`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive hover:text-destructive"
                    aria-label="حذف المتغير"
                    onClick={() => removeVariant(variant.clientKey)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>

                {variant.id === null ? (
                  <p className="mt-2 text-xs text-muted-foreground">متغير جديد — يُنشأ عند الحفظ.</p>
                ) : null}
                {duplicateComboKeys.has(variant.clientKey) ? (
                  <p className="mt-2 text-xs font-medium text-destructive">
                    نفس تركيبة الخصائص مكررة — عدّل القيم قبل الحفظ.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Gallery editor                                                              */
/* -------------------------------------------------------------------------- */

let imageKeyCounter = 0;

export function GalleryEditor({
  images,
  setImages,
  variants,
  mediaAssets,
  uploadConfigured,
  onUpload,
}: {
  images: EditorImage[];
  setImages: React.Dispatch<React.SetStateAction<EditorImage[]>>;
  variants: EditorVariant[];
  mediaAssets: EditorMediaAsset[];
  uploadConfigured: boolean;
  onUpload: (files: FileList | null) => Promise<void>;
}) {
  const [assetId, setAssetId] = useState('');
  const [level, setLevel] = useState('product');
  const [uploading, setUploading] = useState(false);

  function attach() {
    if (!assetId) return;
    imageKeyCounter += 1;
    const asset = mediaAssets.find((item) => item.id === assetId);
    setImages((prev) => [
      ...prev,
      {
        key: `img-${Date.now()}-${imageKeyCounter}`,
        mediaAssetId: assetId,
        level,
        altText: asset?.altText ?? '',
        isPrimary: !prev.some(
          (image) => image.level === level && image.isPrimary,
        ),
        sortOrder: prev.length,
        url: asset?.url ?? '',
      },
    ]);
    setAssetId('');
  }

  function remove(key: string) {
    setImages((prev) => prev.filter((image) => image.key !== key));
  }

  function setPrimary(key: string) {
    const target = images.find((image) => image.key === key);
    if (!target) return;
    setImages((prev) =>
      prev.map((image) =>
        image.level === target.level
          ? { ...image, isPrimary: image.key === key }
          : image,
      ),
    );
  }

  function move(key: string, direction: -1 | 1) {
    const index = images.findIndex((image) => image.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next.map((image, order) => ({ ...image, sortOrder: order })));
  }

  async function handleUpload(files: FileList | null) {
    setUploading(true);
    await onUpload(files);
    setUploading(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">الصور (المعرض + صور المتغيرات)</CardTitle>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          أرفق صورًا من مكتبة الوسائط، وحدد صورة رئيسية واحدة للمعرض. صور
          المتغيرات تظهر عند اختيار المتغير في المتجر.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-background p-3">
          <div className="min-w-48 flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">وسيط من المكتبة</Label>
            <Select value={assetId} onValueChange={setAssetId}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="اختر صورة" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {mediaAssets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.altText ?? asset.url.split('/').pop()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40 space-y-1">
            <Label className="text-xs text-muted-foreground">الإرفاق بـ</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="product">معرض المنتج</SelectItem>
                {variants.map((variant) => (
                  <SelectItem key={variant.clientKey} value={variant.clientKey}>
                    متغير: {variant.sku || '(بدون SKU)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" className="gap-1.5" onClick={attach} disabled={!assetId}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            إرفاق
          </Button>
          {uploadConfigured ? (
            <>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                className="hidden"
                id="editor-upload"
                onChange={(event) => handleUpload(event.target.files)}
              />
              <Button
                type="button"
                variant="ghost"
                className="gap-1.5"
                disabled={uploading}
                onClick={() => document.getElementById('editor-upload')?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Shirt className="h-4 w-4" aria-hidden="true" />
                )}
                رفع صور جديدة أولًا
              </Button>
            </>
          ) : null}
        </div>

        {images.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            لا صور مرفقة بعد.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image, index) => {
              const variantLabel =
                image.level === 'product'
                  ? null
                  : variants.find((variant) => variant.clientKey === image.level)?.sku;
              return (
                <li key={image.key} className="rounded-xl border bg-background p-3">
                  <div className="flex items-start gap-3">
                    <AssetImage
                      src={image.url}
                      alt={image.altText || 'صورة'}
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        value={image.altText}
                        onChange={(event) =>
                          setImages((prev) =>
                            prev.map((item) =>
                              item.key === image.key
                                ? { ...item, altText: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="نص بديل"
                        className="h-9"
                        maxLength={300}
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        {image.level === 'product' ? (
                          <Badge variant="outline">معرض</Badge>
                        ) : (
                          <Badge variant="outline" dir="ltr">
                            {variantLabel ?? 'متغير'}
                          </Badge>
                        )}
                        <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                          <input
                            type="radio"
                            name={`primary-${image.level}`}
                            checked={image.isPrimary}
                            onChange={() => setPrimary(image.key)}
                            className="h-3.5 w-3.5 accent-[var(--primary)]"
                            aria-label="تعيين كصورة رئيسية"
                          />
                          رئيسية
                        </label>
                        <div className="ms-auto flex items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="تقديم"
                            disabled={index === 0}
                            onClick={() => move(image.key, -1)}
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="تأخير"
                            disabled={index === images.length - 1}
                            onClick={() => move(image.key, 1)}
                          >
                            ↓
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            aria-label="إزالة"
                            onClick={() => remove(image.key)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Size guide editor                                                           */
/* -------------------------------------------------------------------------- */

export function SizeGuideEditor({
  sizeGuide,
  onChange,
}: {
  sizeGuide: EditorSizeGuide | null;
  onChange: (guide: EditorSizeGuide | null) => void;
}) {
  const enabled = sizeGuide !== null;
  const guide: EditorSizeGuide =
    sizeGuide ?? { title: '', notes: '', rows: [] };

  function update(patch: Partial<EditorSizeGuide>) {
    onChange({ ...guide, ...patch });
  }

  function addRow() {
    update({
      rows: [
        ...guide.rows,
        { id: `row-${Date.now()}`, sizeLabel: '', bust: '', waist: '', length: '' },
      ],
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">دليل المقاسات (اختياري — ملابس)</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              صفوف اختيارية تُعرض في صفحة المنتج للمقاسات.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => onChange(checked ? { title: '', notes: '', rows: [] } : null)}
            aria-label="تفعيل دليل المقاسات"
          />
        </div>
      </CardHeader>
      {enabled ? (
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">العنوان</Label>
              <Input
                value={guide.title}
                onChange={(event) => update({ title: event.target.value })}
                className="h-10"
                maxLength={200}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">ملاحظات</Label>
              <Input
                value={guide.notes}
                onChange={(event) => update({ notes: event.target.value })}
                className="h-10"
                maxLength={2000}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-125 text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">المقاس</th>
                  <th className="p-2 text-start font-medium">الصدر</th>
                  <th className="p-2 text-start font-medium">الوسط</th>
                  <th className="p-2 text-start font-medium">الطول</th>
                  <th className="p-2 w-10" aria-label="حذف" />
                </tr>
              </thead>
              <tbody>
                {guide.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">
                      لا صفوف بعد.
                    </td>
                  </tr>
                ) : (
                  guide.rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="p-2">
                        <Input
                          value={row.sizeLabel}
                          onChange={(event) =>
                            update({
                              rows: guide.rows.map((item) =>
                                item.id === row.id
                                  ? { ...item, sizeLabel: event.target.value }
                                  : item,
                              ),
                            })
                          }
                          className="h-9"
                          maxLength={40}
                          aria-label="المقاس"
                        />
                      </td>
                      {(['bust', 'waist', 'length'] as const).map((key) => (
                        <td key={key} className="p-2">
                          <Input
                            value={row[key]}
                            onChange={(event) =>
                              update({
                                rows: guide.rows.map((item) =>
                                  item.id === row.id
                                    ? { ...item, [key]: event.target.value }
                                    : item,
                                ),
                              })
                            }
                            className="h-9"
                            maxLength={40}
                            aria-label={
                              key === 'bust' ? 'الصدر' : key === 'waist' ? 'الوسط' : 'الطول'
                            }
                          />
                        </td>
                      ))}
                      <td className="p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label="حذف الصف"
                          onClick={() =>
                            update({ rows: guide.rows.filter((item) => item.id !== row.id) })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            إضافة صف
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
