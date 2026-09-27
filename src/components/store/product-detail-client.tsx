"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Info,
  Minus,
  PackageX,
  Plus,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { discountPercent, formatPrice } from "@/lib/storefront/format";
import {
  buildCartEntryDraft,
  type CartEntryDraft,
} from "@/lib/storefront/metadata";

export type DetailVariant = {
  id: string;
  sku: string;
  originalPrice: string;
  currentPrice: string;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
  assignments: Array<{ attributeId: string; valueId: string }>;
};

export type ProductDetailClientProps = {
  product: {
    id: string;
    name: string;
    slug: string;
    shortDescription: string | null;
    categoryName: string;
    categorySlug: string;
  };
  attributes: Array<{ id: string; name: string; values: Array<{ id: string; value: string }> }>;
  variants: DetailVariant[];
  gallery: Array<{ id: string; url: string; alt: string | null }>;
  variantImages: Record<string, Array<{ id: string; url: string; alt: string | null }>>;
};

type StockState = "in" | "low" | "out";

const STOCK_LABELS: Record<StockState, { text: string; className: string }> = {
  in: { text: "متوفر — جاهز للشحن", className: "text-success" },
  low: { text: "كمية محدودة — اطلبي الآن", className: "text-warning" },
  out: { text: "نفدت الكمية", className: "text-destructive" },
};

/**
 * Product detail purchase surface (PHASE-05 tasks 11–12):
 * gallery with variant-aware imagery, explicit variant selectors with dynamic
 * availability (including honestly-disabled inactive variants), quantity, and
 * the add-to-cart ENTRY POINT that builds the exact `CartEntryDraft` contract
 * (selected variant is always explicit; the cart itself arrives PHASE-06).
 */
export function ProductDetailClient({
  product,
  attributes,
  variants,
  gallery,
  variantImages,
}: ProductDetailClientProps) {
  const { toast } = useToast();

  /* ----------------------------- selection state ---------------------------- */
  const [selected, setSelected] = useState<Record<string, string | undefined>>(() => {
    // Pre-select when an attribute has exactly one possible value.
    const initial: Record<string, string | undefined> = {};
    for (const attribute of attributes) {
      initial[attribute.id] =
        attribute.values.length === 1 ? attribute.values[0]!.id : undefined;
    }
    return initial;
  });
  const [quantity, setQuantity] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const activeVariants = useMemo(() => variants.filter((v) => v.isActive), [variants]);

  const matchesSelection = useMemo(
    () =>
      (variant: DetailVariant, selection: Record<string, string | undefined>): boolean =>
        Object.entries(selection).every(
          ([attributeId, valueId]) =>
            valueId === undefined ||
            variant.assignments.some(
              (assignment) =>
                assignment.attributeId === attributeId && assignment.valueId === valueId,
            ),
        ),
    [],
  );

  /* --------------------------- availability logic --------------------------- */
  const isValueSelectable = (attributeId: string, valueId: string): boolean =>
    activeVariants.some((variant) =>
      matchesSelection(variant, { ...selected, [attributeId]: valueId }),
    );

  const isValueEverActive = (attributeId: string, valueId: string): boolean =>
    activeVariants.some((variant) =>
      variant.assignments.some(
        (assignment) => assignment.attributeId === attributeId && assignment.valueId === valueId,
      ),
    );

  const completeSelection =
    attributes.length === 0 || attributes.every((a) => selected[a.id] !== undefined);

  const selectedVariant: DetailVariant | null = useMemo(() => {
    if (attributes.length === 0) return activeVariants[0] ?? null;
    if (!completeSelection) return null;
    return activeVariants.find((variant) => matchesSelection(variant, selected)) ?? null;
  }, [attributes.length, activeVariants, completeSelection, matchesSelection, selected]);

  /* ------------------------------- derived UI ------------------------------- */
  const attributeNameById = useMemo(
    () => new Map(attributes.map((a) => [a.id, a.name])),
    [attributes],
  );
  const valueLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const attribute of attributes) {
      for (const value of attribute.values) map.set(value.id, value.value);
    }
    return map;
  }, [attributes]);

  const selectionLabel =
    attributes.length > 0
      ? attributes
          .map((attribute) => {
            const valueId = selected[attribute.id];
            return valueId
              ? `${attribute.name}: ${valueLabelById.get(valueId) ?? ""}`
              : null;
          })
          .filter(Boolean)
          .join(" · ")
      : product.name;

  // Price display: exact once fully selected, otherwise the honest active range.
  const activePrices = activeVariants.map((variant) => Number(variant.currentPrice));
  const rangeMin = activePrices.length ? Math.min(...activePrices) : null;
  const rangeMax = activePrices.length ? Math.max(...activePrices) : null;

  const showExact = selectedVariant !== null;
  const displayPrice = showExact ? selectedVariant!.currentPrice : null;
  const displayOriginal = showExact && discountPercent(selectedVariant!.originalPrice, selectedVariant!.currentPrice) > 0
    ? selectedVariant!.originalPrice
    : null;

  const stockState: StockState | null = selectedVariant
    ? selectedVariant.stockQuantity === 0
      ? "out"
      : selectedVariant.stockQuantity <= selectedVariant.lowStockThreshold
        ? "low"
        : "in"
    : null;

  /* --------------------- variant-aware gallery imagery ---------------------- */
  const images = useMemo(() => {
    const base = gallery;
    const variantOwn = selectedVariant ? (variantImages[selectedVariant.id] ?? []) : [];
    if (variantOwn.length === 0) return base;
    const baseUrls = new Set(variantOwn.map((image) => image.url));
    return [...variantOwn, ...base.filter((image) => !baseUrls.has(image.url))];
  }, [gallery, selectedVariant, variantImages]);

  const imagesKey = images.map((image) => image.id).join("|");

  // Reset derived UI state when the displayed imagery / selected variant changes —
  // "adjust state during render" pattern (react.dev/learn/you-might-not-need-an-effect):
  // re-rendering with updated state synchronously, no cascading effect pass.
  const [prevImagesKey, setPrevImagesKey] = useState(imagesKey);
  if (prevImagesKey !== imagesKey) {
    setPrevImagesKey(imagesKey);
    setActiveImageIndex(0);
  }

  const selectedVariantId = selectedVariant?.id ?? null;
  const [prevVariantId, setPrevVariantId] = useState(selectedVariantId);
  if (prevVariantId !== selectedVariantId) {
    setPrevVariantId(selectedVariantId);
    setQuantity(1);
  }

  const maxQuantity = selectedVariant
    ? Math.max(1, Math.min(selectedVariant.stockQuantity, 99))
    : 1;

  const canAddToCart = selectedVariant !== null && selectedVariant.stockQuantity > 0;

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    const draft: CartEntryDraft = buildCartEntryDraft({
      product: { id: product.id, slug: product.slug, name: product.name },
      variant: {
        id: selectedVariant.id,
        sku: selectedVariant.sku,
        currentPrice: selectedVariant.currentPrice,
        assignments: selectedVariant.assignments.map((assignment) => ({
          attributeName: attributeNameById.get(assignment.attributeId) ?? "",
          value: valueLabelById.get(assignment.valueId) ?? "",
        })),
      },
      quantity,
    });
    const estimated = (Number(draft.unitPrice) * draft.quantity).toFixed(2);
    toast({
      title: "تم تجهيز اختيارك ✓",
      description: `${draft.variantLabel} × ${draft.quantity} — ${formatPrice(estimated)}. السلة تُتاح في المرحلة التالية من المشروع.`,
    });
  };

  const currentImage = images[activeImageIndex] ?? images[0] ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] xl:gap-12">
      {/* ------------------------------- Gallery ------------------------------ */}
      <section aria-label="صور المنتج" className="flex flex-col gap-3">
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border bg-surface-subtle">
          {currentImage ? (
            <Image
              key={currentImage.id}
              src={currentImage.url}
              alt={currentImage.alt ?? product.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 55vw"
              className="object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <ImageIcon aria-hidden className="size-14 text-muted-foreground/40" />
            </span>
          )}

          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => setActiveImageIndex((index) => (index + 1) % images.length)}
                aria-label="الصورة التالية"
                className="absolute end-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 shadow-md transition-colors hover:bg-surface"
              >
                <ChevronLeft aria-hidden className="size-5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveImageIndex((index) => (index - 1 + images.length) % images.length)
                }
                aria-label="الصورة السابقة"
                className="absolute start-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 shadow-md transition-colors hover:bg-surface"
              >
                <ChevronRight aria-hidden className="size-5" />
              </button>
              <span className="absolute bottom-3 start-3 rounded-full bg-foreground/80 px-2.5 py-0.5 text-[11px] font-bold text-background">
                {activeImageIndex + 1} / {images.length}
              </span>
            </>
          ) : null}
        </div>

        {images.length > 1 ? (
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="مصغرات الصور">
            {images.map((image, index) => (
              <li key={image.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`عرض الصورة ${index + 1}`}
                  aria-current={index === activeImageIndex}
                  className={cn(
                    "relative size-16 overflow-hidden rounded-xl border-2 bg-surface-subtle transition-colors sm:size-20",
                    index === activeImageIndex
                      ? "border-primary"
                      : "border-transparent hover:border-blush-deep"
                  )}
                >
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* --------------------------- Purchase surface -------------------------- */}
      <section aria-label="تفاصيل الشراء" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Link
            href={`/category/${encodeURIComponent(product.categorySlug)}`}
            className="w-fit rounded-full bg-blush px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-blush-deep/60"
          >
            {product.categoryName}
          </Link>
          <h1 className="text-2xl font-bold leading-snug sm:text-3xl">{product.name}</h1>
          {product.shortDescription ? (
            <p className="text-sm leading-loose text-muted-foreground sm:text-base">
              {product.shortDescription}
            </p>
          ) : null}
        </div>

        {/* Price block — exact after selection, range before it */}
        <div className="rounded-2xl border bg-surface p-4">
          {showExact && displayPrice ? (
            <div className="flex flex-wrap items-baseline gap-3">
              {displayOriginal ? (
                <span className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">
                  خصم {discountPercent(displayOriginal, displayPrice)}%
                </span>
              ) : null}
              <span className="text-3xl font-bold text-primary">
                {formatPrice(displayPrice)}
              </span>
              {displayOriginal ? (
                <span className="text-base text-muted-foreground line-through">
                  {formatPrice(displayOriginal)}
                </span>
              ) : null}
            </div>
          ) : rangeMin !== null ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-primary">{formatPrice(rangeMin)}</span>
                {rangeMax !== null && rangeMax !== rangeMin ? (
                  <span className="text-base text-muted-foreground">— {formatPrice(rangeMax)}</span>
                ) : null}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info aria-hidden className="size-3.5" />
                اختاري من الخيارات لعرض السعر النهائي
              </p>
            </div>
          ) : (
            <span className="text-lg font-semibold text-muted-foreground">غير متاح حاليًا</span>
          )}
          {selectedVariant ? (
            <p className="mt-2 text-xs text-muted-foreground">
              رمز المنتج: <span dir="ltr" className="font-mono">{selectedVariant.sku}</span>
            </p>
          ) : null}
        </div>

        {/* Variant selectors — explicit, dynamically available (task 11/12) */}
        {attributes.map((attribute) => (
          <fieldset key={attribute.id} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-bold">
              {attribute.name}
              <span aria-hidden className="text-destructive"> *</span>
            </legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label={attribute.name}>
              {attribute.values.map((value) => {
                const isSelected = selected[attribute.id] === value.id;
                const selectable = isValueSelectable(attribute.id, value.id);
                const everActive = isValueEverActive(attribute.id, value.id);
                return (
                  <button
                    key={value.id}
                    type="button"
                    disabled={!selectable}
                    aria-pressed={isSelected}
                    aria-label={`${attribute.name}: ${value.value}${everActive ? "" : " — غير متاح حاليًا"}`}
                    onClick={() =>
                      setSelected((previous) => ({
                        ...previous,
                        [attribute.id]: isSelected ? undefined : value.id,
                      }))
                    }
                    className={cn(
                      "min-w-11 rounded-full border px-4 py-2 text-sm font-medium transition-all",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-surface text-foreground hover:border-blush-deep hover:bg-blush/40",
                      !selectable && "cursor-not-allowed opacity-40 line-through hover:bg-surface hover:border-border"
                    )}
                  >
                    {value.value}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        {/* Explicit selection summary (task 12) */}
        <div
          aria-live="polite"
          className="rounded-xl border border-dashed bg-surface-subtle/60 px-4 py-3 text-sm"
        >
          {completeSelection && selectedVariant ? (
            <>
              <span className="font-bold">اختيارك: </span>
              {selectionLabel}
            </>
          ) : attributes.length > 0 ? (
            <span className="text-muted-foreground">
              اختاري {attributes.map((a) => a.name).join(" و")} لتحديد المنتج بدقة
            </span>
          ) : null}
        </div>

        {/* Availability line */}
        {stockState ? (
          <p className={cn("flex items-center gap-2 text-sm font-semibold", STOCK_LABELS[stockState].className)}>
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                stockState === "in" && "bg-success",
                stockState === "low" && "bg-warning",
                stockState === "out" && "bg-destructive"
              )}
            />
            {STOCK_LABELS[stockState].text}
          </p>
        ) : null}

        {/* Quantity + add-to-cart entry point */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-full border border-border bg-surface">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full"
              aria-label="زيادة الكمية"
              disabled={!canAddToCart || quantity >= maxQuantity}
              onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
            >
              <Plus aria-hidden className="size-4" />
            </Button>
            <span
              aria-live="polite"
              aria-label={`الكمية: ${quantity}`}
              className="w-10 text-center text-sm font-bold"
            >
              {quantity}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full"
              aria-label="إنقاص الكمية"
              disabled={!canAddToCart || quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Minus aria-hidden className="size-4" />
            </Button>
          </div>

          <Button
            type="button"
            size="lg"
            disabled={!canAddToCart}
            onClick={handleAddToCart}
            className="min-w-44 flex-1 rounded-full text-base font-bold"
          >
            {selectedVariant === null && attributes.length > 0
              ? "اختاري الخيارات أولًا"
              : stockState === "out"
                ? "نفدت الكمية"
                : "أضيفي إلى السلة"}
          </Button>
        </div>

        {stockState === "out" ? (
          <p className="flex items-start gap-2 rounded-xl bg-destructive/5 px-4 py-3 text-xs leading-relaxed text-destructive">
            <PackageX aria-hidden className="mt-0.5 size-4 shrink-0" />
            هذا الاختيار غير متوفر حاليًا — يمكنك اختيار مقاس أو لون آخر من الخيارات أعلاه.
          </p>
        ) : null}

        {/* Trust hints (factual only — COD + WhatsApp shipping per MASTER_PLAN §9) */}
        <ul className="flex flex-col gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground sm:text-sm">
          <li className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-4 text-success" />
            الدفع عند الاستلام — كاش فقط
          </li>
          <li className="flex items-center gap-2">
            <Truck aria-hidden className="size-4 text-primary" />
            تكلفة الشحن تُتفق عليها معك عبر واتساب بعد تأكيد العنوان
          </li>
        </ul>
      </section>
    </div>
  );
}
