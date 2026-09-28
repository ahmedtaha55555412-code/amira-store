"use client";

/**
 * Amira Store — customer review flow (PHASE-09).
 *
 * Three honest steps, no customer account:
 *   1. order number + checkout phone → server match (generic errors; no
 *      order-existence oracle) → delivered, not-yet-reviewed items;
 *   2. pick ONE item → rating 1–5 + comment (+ optional image, validated
 *      client-side for early feedback and authoritatively server-side);
 *   3. success state — the review enters PENDING moderation and is never
 *      rendered publicly until an admin approves it.
 *
 * The image travels INSIDE the submission (multipart) — there is no separate
 * anonymous upload step, hence no orphan-media window. All state changes are
 * explicit; no silent catches; every button state is disabled while pending.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { CheckCircle2, ImagePlus, Loader2, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type LookupItem = {
  orderItemId: string;
  productName: string;
  attributesLabel: string | null;
  quantity: number;
  alreadyReviewed: boolean;
};

type Step = "credentials" | "compose" | "done";

const RATING_LABELS = ["", "مخيّب للآمال", "ضعيف", "مقبول", "جيد جدًا", "ممتاز"] as const;

function StarPicker({
  rating,
  onChange,
  disabled,
}: {
  rating: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || rating;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex flex-row-reverse items-center gap-1"
        onMouseLeave={() => setHover(0)}
        role="radiogroup"
        aria-label="اختيار التقييم من ١ إلى ٥ نجوم"
      >
        {[5, 4, 3, 2, 1].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} من ٥ — ${RATING_LABELS[value]}`}
            disabled={disabled}
            onMouseEnter={() => setHover(value)}
            onFocus={() => setHover(value)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(value)}
            className={cn(
              "rounded-full p-1.5 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              shown >= value ? "scale-110" : "scale-100",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <StarGlyph filled={shown >= value} />
          </button>
        ))}
      </div>
      {shown > 0 ? (
        <p className="text-sm font-medium text-gold-deep" aria-live="polite">
          {RATING_LABELS[shown]}
        </p>
      ) : null}
    </div>
  );
}

function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={cn("size-8", filled ? "fill-gold text-gold-deep" : "fill-transparent text-muted-foreground/40")}
    >
      <path
        d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z"
        strokeWidth="1.2"
        stroke="currentColor"
      />
    </svg>
  );
}

export function ReviewForm() {
  const [step, setStep] = useState<Step>("credentials");
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState<LookupItem[]>([]);
  const [selected, setSelected] = useState<LookupItem | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleLookup(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/storefront/reviews/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), phone: phone.trim() }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: true; items?: LookupItem[]; error?: string }
        | null;
      if (!response.ok || !data?.ok || !data.items) {
        setError(data?.error ?? "تعذر التحقق من الطلب — برجاء المحاولة مرة أخرى.");
        return;
      }
      const eligible = data.items.filter((item) => !item.alreadyReviewed);
      if (eligible.length === 0) {
        setError("كل منتجات هذا الطلب تم تقييمها مسبقًا — شكرًا لمشاركتك!");
        return;
      }
      setItems(data.items);
      setSelected(null);
      setStep("compose");
    } catch {
      setError("تعذر الاتصال — تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    } finally {
      setPending(false);
    }
  }

  function validateFile(candidate: File): string | null {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(candidate.type)) {
      return "صيغة الصورة غير مدعومة — المسموح: JPG أو PNG أو WebP أو AVIF.";
    }
    if (candidate.size > 8 * 1024 * 1024) {
      return "حجم الصورة يتجاوز ٨ ميغابايت.";
    }
    return null;
  }

  function handleFileChange(next: File | null) {
    setFileError(null);
    if (!next) {
      setFile(null);
      if (filePreview) URL.revokeObjectURL(filePreview);
      setFilePreview(null);
      return;
    }
    const problem = validateFile(next);
    if (problem) {
      setFileError(problem);
      return;
    }
    setFile(next);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(URL.createObjectURL(next));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!selected) return;
    if (rating < 1 || rating > 5) {
      setError("برجاء اختيار تقييم من ١ إلى ٥ نجوم.");
      return;
    }
    if (comment.trim().length < 10) {
      setError("اكتب تقييمًا من ١٠ أحرف على الأقل.");
      return;
    }

    setPending(true);
    try {
      const body = new FormData();
      body.set("orderNumber", orderNumber.trim());
      body.set("phone", phone.trim());
      body.set("orderItemId", selected.orderItemId);
      body.set("rating", String(rating));
      body.set("comment", comment.trim());
      if (file) body.set("image", file);

      const response = await fetch("/api/storefront/reviews", {
        method: "POST",
        body,
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: true; error?: string }
        | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "تعذر إرسال التقييم — برجاء المحاولة مرة أخرى.");
        return;
      }
      setStep("done");
    } catch {
      setError("تعذر الاتصال — تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    } finally {
      setPending(false);
    }
  }

  if (step === "done") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border bg-surface p-8 text-center">
        <CheckCircle2 aria-hidden className="size-14 text-success" />
        <h2 className="text-xl font-bold">تم استلام تقييمك بنجاح</h2>
        <p className="text-sm leading-loose text-muted-foreground">
          شكرًا لمشاركتك تجربتك مع أميرة استور. التقييم يخضع الآن للمراجعة،
          وسيظهر على صفحة المنتج بعد الموافقة.
        </p>
        <Button
          variant="outline"
          className="mt-2 rounded-full"
          onClick={() => {
            setStep("credentials");
            setOrderNumber("");
            setPhone("");
            setItems([]);
            setSelected(null);
            setRating(0);
            setComment("");
            handleFileChange(null);
          }}
        >
          تقييم طلب آخر
        </Button>
      </div>
    );
  }

  if (step === "compose") {
    const eligible = items.filter((item) => !item.alreadyReviewed);
    return (
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-2xl flex-col gap-6 rounded-2xl border bg-surface p-5 sm:p-8"
        noValidate
      >
        {!selected ? (
          <>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-lg font-bold">اختر المنتج الذي تريد تقييمه</h2>
              <p className="text-sm text-muted-foreground">
                منتجات هذا الطلب المسلَّمة — مراجعة واحدة لكل منتج.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {eligible.map((item) => (
                <li key={item.orderItemId}>
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    disabled={pending}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border bg-surface p-4 text-start transition-colors hover:bg-surface-subtle/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold">{item.productName}</span>
                      {item.attributesLabel ? (
                        <span className="text-xs text-muted-foreground">{item.attributesLabel}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 rounded-full bg-blush px-3 py-1 text-xs font-semibold text-secondary-foreground">
                      الكمية {item.quantity.toLocaleString("ar-EG-u-nu-latn")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {error ? (
              <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setStep("credentials")}
              className="min-h-11 w-fit rounded-full"
            >
              رجوع
            </Button>
          </>
        ) : (
          <>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-bold">تقييم المنتج</h2>
          <div className="rounded-xl border bg-surface-subtle/60 p-3">
            <p className="font-semibold">{selected.productName}</p>
            {selected.attributesLabel ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selected.attributesLabel} · الكمية: {selected.quantity.toLocaleString("ar-EG-u-nu-latn")}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">
                الكمية: {selected.quantity.toLocaleString("ar-EG-u-nu-latn")}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label id="rating-label" className="text-sm font-semibold">
            تقييمك للمنتج *
          </Label>
          <StarPicker rating={rating} onChange={setRating} disabled={pending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="review-comment" className="text-sm font-semibold">
            تجربتك مع المنتج *
          </Label>
          <Textarea
            id="review-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={5}
            maxLength={1000}
            required
            disabled={pending}
            placeholder="اكتب رأيك بصدق — الجودة، المقاس، سرعة التوصيل…"
            aria-describedby="review-comment-hint"
            className="min-h-28"
          />
          <p id="review-comment-hint" className="text-xs text-muted-foreground">
            {comment.trim().length.toLocaleString("ar-EG-u-nu-latn")} / ١٠٠٠ حرف — ١٠ أحرف على الأقل.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="review-image" className="text-sm font-semibold">
            صورة (اختياري)
          </Label>
          {filePreview ? (
            <div className="relative w-fit">
              <Image
                src={filePreview}
                alt="معاينة الصورة المرفقة"
                width={120}
                height={120}
                className="size-30 rounded-xl border object-cover"
                unoptimized
              />
              <button
                type="button"
                onClick={() => handleFileChange(null)}
                disabled={pending}
                aria-label="إزالة الصورة المرفقة"
                className="absolute -top-2 -start-2 flex size-8 items-center justify-center rounded-full border bg-surface text-destructive shadow-sm transition-colors hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className="flex min-h-14 w-fit items-center gap-2 rounded-xl border border-dashed px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-subtle/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ImagePlus aria-hidden className="size-5" />
              إرفاق صورة للمنتج (حتى ٨ ميغابايت)
            </button>
          )}
          <input
            ref={fileInputRef}
            id="review-image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            disabled={pending}
          />
          {fileError ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {fileError}
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending} className="min-h-11 gap-2 rounded-full px-6">
            {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
            إرسال التقييم
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setSelected(null);
              setRating(0);
              setError(null);
            }}
            className="min-h-11 rounded-full"
          >
            رجوع لاختيار المنتج
          </Button>
        </div>

        {eligible.length > 1 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            لديك منتجات أخرى مؤهلة للتقييم في نفس الطلب — يمكنك إرسال تقييم لكل
            منتج على حدة.
          </p>
        ) : null}
          </>
        )}
      </form>
    );
  }

  // Step 1 — credentials
  return (
    <form
      onSubmit={handleLookup}
      className="mx-auto flex max-w-lg flex-col gap-5 rounded-2xl border bg-surface p-5 sm:p-8"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-bold">تحقق من طلبك</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          أدخل رقم الطلب ورقم الموبايل الذي استخدمتَه في الشراء. التقييم متاح
          بعد تسليم الطلب.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="review-order-number" className="text-sm font-semibold">
          رقم الطلب *
        </Label>
        <Input
          id="review-order-number"
          value={orderNumber}
          onChange={(event) => setOrderNumber(event.target.value)}
          placeholder="AMR-XXXXXX"
          dir="ltr"
          autoComplete="off"
          required
          disabled={pending}
          className="min-h-11 text-start"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="review-phone" className="text-sm font-semibold">
          رقم الموبايل (المستخدم في الشراء) *
        </Label>
        <Input
          id="review-phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="01012345678"
          dir="ltr"
          autoComplete="tel"
          required
          disabled={pending}
          className="min-h-11 text-start"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="min-h-11 gap-2 rounded-full px-6">
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        التالي
      </Button>

      <p className="text-xs leading-relaxed text-muted-foreground">
        تُنشر التقييمات بعد مراجعتها من إدارة المتجر. تقييمك مرتبط بعملية شراء
        فعلية ويظهر مع شارة «مشتري موثّق».
      </p>
    </form>
  );
}
