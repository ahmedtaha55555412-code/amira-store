'use client';

/**
 * Order items editor (PHASE-08 tasks 8–11 UI).
 * The admin edits the DESIRED final line set (quantity steppers, line removal,
 * adding variants via server-side search); the SERVER computes the inventory
 * delta against the prior committed state and applies everything atomically.
 * The local totals preview is display-only — server truth always wins.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { centsToPriceString } from '@/lib/storefront/cart';
import { moneyToCents } from '@/lib/storefront/whatsapp';
import { formatPrice } from '@/lib/storefront/format';

type EditorLine = {
  variantId: string;
  productName: string;
  attributesLabel: string;
  sku: string;
  unitPrice: string;
  quantity: number;
  isNew: boolean;
};

type VariantSearchResult = {
  variantId: string;
  sku: string;
  productName: string;
  currentPrice: string;
  stockQuantity: number;
  isActive: boolean;
  attributesLabel: string;
};

export function OrderItemsEditor({
  orderId,
  initialLines,
  initialNotes,
  initialAddress,
}: {
  orderId: string;
  initialLines: EditorLine[];
  initialNotes: string;
  initialAddress: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(initialLines);
  const [notes, setNotes] = useState(initialNotes);
  const [address, setAddress] = useState(initialAddress);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Variant search (add-line flow)
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);

  const previewCents = lines.reduce(
    (sum, line) => sum + moneyToCents(line.unitPrice) * line.quantity,
    0,
  );

  function setQuantity(variantId: string, quantity: number) {
    setLines((current) =>
      current.map((line) =>
        line.variantId === variantId ? { ...line, quantity: Math.max(1, Math.min(99, quantity)) } : line,
      ),
    );
  }

  function removeLine(variantId: string) {
    setLines((current) => current.filter((line) => line.variantId !== variantId));
  }

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) {
      setSearchNote('اكتب حرفين على الأقل للبحث.');
      setResults([]);
      return;
    }
    setSearching(true);
    setSearchNote(null);
    try {
      const response = await fetch(
        `/api/admin/orders/variant-search?q=${encodeURIComponent(q)}`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        results?: VariantSearchResult[];
        error?: string;
      };
      if (!response.ok) {
        setSearchNote(payload.error ?? 'تعذّر البحث. حاول مرة أخرى.');
        setResults([]);
        return;
      }
      setResults(payload.results ?? []);
      if ((payload.results ?? []).length === 0) setSearchNote('لا نتائج مطابقة.');
    } catch {
      setSearchNote('تعذّر الاتصال بالخادم.');
    } finally {
      setSearching(false);
    }
  }

  function addVariant(result: VariantSearchResult) {
    if (lines.some((line) => line.variantId === result.variantId)) {
      setSearchNote('هذا المتغير موجود بالفعل في الطلب — عدّل كميته من القائمة.');
      return;
    }
    setLines((current) => [
      ...current,
      {
        variantId: result.variantId,
        productName: result.productName,
        attributesLabel: result.attributesLabel,
        sku: result.sku,
        unitPrice: result.currentPrice,
        quantity: 1,
        isNew: true,
      },
    ]);
    setSearchNote(null);
    setResults([]);
    setQuery('');
  }

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
          notes: notes.trim() === '' ? null : notes.trim(),
          address: address.trim(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? 'تعذّر حفظ التعديلات. حاول مرة أخرى.');
        return;
      }
      router.refresh();
    } catch {
      setError('تعذّر الاتصال بالخادم. حاول مرة أخرى.');
    } finally {
      setPending(false);
    }
  }

  function onReset() {
    setLines(initialLines);
    setNotes(initialNotes);
    setAddress(initialAddress);
    setError(null);
    setResults([]);
    setQuery('');
  }

  const dirty =
    JSON.stringify({ lines, notes, address }) !==
    JSON.stringify({ lines: initialLines, notes: initialNotes, address: initialAddress });

  return (
    <div className="space-y-4">
      {lines.length === 0 ? (
        <p className="rounded-lg bg-blush p-3 text-sm text-secondary-foreground">
          لا توجد بنود — أضف متغيرًا واحدًا على الأقل قبل الحفظ.
        </p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li
              key={line.variantId}
              className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {line.productName}
                  {line.isNew && (
                    <span className="ms-2 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                      إضافة جديدة
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {line.attributesLabel ? `${line.attributesLabel} · ` : ''}
                  <span dir="ltr">SKU: {line.sku}</span> · وحدة:{' '}
                  {formatPrice(line.unitPrice)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 rounded-full p-0"
                  aria-label={`تقليل كمية ${line.productName}`}
                  disabled={pending || line.quantity <= 1}
                  onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                >
                  −
                </Button>
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  className="h-8 w-14 text-center"
                  aria-label={`كمية ${line.productName}`}
                  value={line.quantity}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    if (Number.isFinite(parsed)) setQuantity(line.variantId, parsed);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 rounded-full p-0"
                  aria-label={`زيادة كمية ${line.productName}`}
                  disabled={pending || line.quantity >= 99}
                  onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                >
                  +
                </Button>
              </div>
              <span className="min-w-24 text-end text-sm font-semibold text-foreground">
                {centsToPriceString(moneyToCents(line.unitPrice) * line.quantity)} ج.م.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-full p-0 text-destructive hover:text-destructive"
                aria-label={`إزالة ${line.productName} من الطلب`}
                disabled={pending}
                onClick={() => removeLine(line.variantId)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Add-line variant search */}
      <div className="rounded-xl border border-dashed bg-background p-3 space-y-2">
        <Label htmlFor="variant-search-input" className="text-xs text-muted-foreground">
          إضافة منتج للطلب — ابحث بالاسم أو رمز SKU
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="variant-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void runSearch();
              }
            }}
            placeholder="مثال: فستان صيفي أو SKU"
            className="h-9"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void runSearch()}
            disabled={searching}
            className="gap-1.5 rounded-full"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            بحث
          </Button>
        </div>
        {searchNote && <p className="text-xs text-muted-foreground">{searchNote}</p>}
        {results.length > 0 && (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto pe-1">
            {results.map((result) => (
              <li
                key={result.variantId}
                className="flex items-center gap-2 rounded-lg border bg-card p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {result.productName} —{' '}
                    <span dir="ltr">{result.sku}</span>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {result.attributesLabel ? `${result.attributesLabel} · ` : ''}
                    {formatPrice(result.currentPrice)} · متاح: {result.stockQuantity}
                    {!result.isActive && ' · غير مفعّل (سيُرفض الحفظ)'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => addVariant(result)}
                >
                  إضافة
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Notes + address */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="order-notes-input" className="text-xs text-muted-foreground">
            ملاحظات الطلب (اختياري)
          </Label>
          <Textarea
            id="order-notes-input"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            maxLength={500}
            className="resize-none"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-address-input" className="text-xs text-muted-foreground">
            عنوان التسليم (كما يصل عبر واتساب)
          </Label>
          <Textarea
            id="order-address-input"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            rows={2}
            maxLength={500}
            className="resize-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-sm text-muted-foreground">
          إجمالي المنتجات (معاينة محلية):{' '}
          <span className="font-bold text-foreground">{centsToPriceString(previewCents)} ج.م.</span>
          {' '}— الحقيقة النهائية يُعيد حسابها الخادم.
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={onReset}
              disabled={pending}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              تراجع
            </Button>
          )}
          <Button
            type="button"
            onClick={() => void onSave()}
            disabled={pending || lines.length === 0 || !dirty}
            className="gap-1.5 rounded-full"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {pending ? 'جارٍ الحفظ…' : 'حفظ تعديلات الطلب'}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
