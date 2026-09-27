"use client";

import {
  Inbox,
  Palette,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { LogoMark } from "@/components/brand/logo-mark";
import { EmptyState, ErrorState, LoadingState } from "./states";

/**
 * PHASE-01 visual playground — manual QA reference for the design system.
 * Clearly labeled as an internal review tool; not part of the customer
 * experience and removed/gated before launch phases.
 */

const SWATCHES: Array<{ token: string; className: string }> = [
  { token: "--background", className: "bg-background" },
  { token: "--surface", className: "bg-surface" },
  { token: "--surface-subtle", className: "bg-surface-subtle" },
  { token: "--blush", className: "bg-blush" },
  { token: "--blush-deep", className: "bg-blush-deep" },
  { token: "--gold", className: "bg-gold" },
  { token: "--gold-deep", className: "bg-gold-deep" },
  { token: "--primary", className: "bg-primary" },
  { token: "--secondary", className: "bg-secondary" },
  { token: "--success", className: "bg-success" },
  { token: "--warning", className: "bg-warning" },
  { token: "--destructive", className: "bg-destructive" },
  { token: "--foreground", className: "bg-foreground" },
  { token: "--footer", className: "bg-footer" },
];

const DEMO_ROWS = [
  { name: "منتج عرض توضيحي", size: "مقاس M", price: "349 ج.م", status: "متاح" },
  { name: "منتج عرض توضيحي", size: "مقاس L", price: "349 ج.م", status: "متاح" },
  { name: "منتج عرض توضيحي", size: "مقاس XL", price: "—", status: "نفدت الكمية" },
];

export function ComponentPlayground() {
  const { toast } = useToast();

  const showToast = (variant?: "default" | "destructive") =>
    toast({
      title: variant === "destructive" ? "تنبيه تجريبي (خطأ)" : "تنبيه تجريبي",
      description:
        "هذا نموذج للتنبيهات المنبثقة المستخدمة في المتجر — بيانات عرض فقط.",
      variant,
    });

  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] end-4 z-40 print:hidden">
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            aria-label="أداة فحص مكونات التصميم — للمراجعة اليدوية فقط"
            className="h-11 rounded-full border-dashed bg-surface/90 shadow-sm"
          >
            <Palette aria-hidden className="size-4 text-gold-deep" />
            <span className="hidden sm:inline">فحص التصميم</span>
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-4xl">
          <DialogHeader className="text-start">
            <DialogTitle>أداة فحص مكونات النظام — مرحلة 01</DialogTitle>
            <DialogDescription>
              مرجع مرئي للمراجعة اليدوية: الألوان، الطباعة، المكونات، والحالات.
              أداة داخلية للفحص ولن تظهر للعملاء في الإطلاق. تنقّل باللوحة
              المفاتيح (Tab) للتحقق من حالات التركيز.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="colors" dir="rtl">
            <TabsList className="grid w-full grid-cols-4 sm:grid-cols-8">
              <TabsTrigger value="colors">الألوان</TabsTrigger>
              <TabsTrigger value="type">الطباعة</TabsTrigger>
              <TabsTrigger value="buttons">الأزرار</TabsTrigger>
              <TabsTrigger value="inputs">الحقول</TabsTrigger>
              <TabsTrigger value="cards">البطاقات</TabsTrigger>
              <TabsTrigger value="table">الجداول</TabsTrigger>
              <TabsTrigger value="states">الحالات</TabsTrigger>
              <TabsTrigger value="alerts">التنبيهات</TabsTrigger>
            </TabsList>

            <ScrollArea className="max-h-[65vh] pe-3">
              <div className="pt-4">
                {/* ------------------------------ Colors ------------------------------ */}
                <TabsContent value="colors" className="mt-0">
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {SWATCHES.map(({ token, className }) => (
                      <li key={token} className="flex flex-col gap-1.5">
                        <span
                          className={`h-14 w-full rounded-lg border ${className}`}
                        />
                        <code
                          dir="ltr"
                          className="text-[11px] text-muted-foreground"
                        >
                          {token}
                        </code>
                      </li>
                    ))}
                  </ul>
                  <Separator className="my-5" />
                  <div className="flex flex-wrap items-center gap-4">
                    <LogoMark className="size-14" />
                    <LogoMark className="size-10" />
                    <LogoMark className="size-7" />
                    <span className="text-xs text-muted-foreground">
                      الشعار الأصلي — أصول قابلة للاستبدال من الإعدادات لاحقًا
                    </span>
                  </div>
                </TabsContent>

                {/* ---------------------------- Typography ---------------------------- */}
                <TabsContent value="type" className="mt-0 space-y-4">
                  <div className="rounded-xl border bg-surface p-4">
                    <p className="text-4xl font-extrabold">أميرة استور</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      خط القاهرة (Cairo) — العائلة العربية الوحيدة للمشروع ·
                      أوزان 400/500/600/700/800
                    </p>
                  </div>
                  <h1 className="text-3xl font-extrabold">
                    عنوان رئيسي h1 — أناقة لكل العائلة
                  </h1>
                  <h2 className="text-2xl font-bold">عنوان قسم h2</h2>
                  <h3 className="text-xl font-bold">عنوان فرعي h3</h3>
                  <h4 className="text-lg font-bold">عنوان داخلي h4</h4>
                  <p className="leading-loose">
                    نص أساسي بحجم مريح للقراءة العربية مع تباعد أسطر واسع:
                    تشكيلات مختارة بعناية لكل أفراد العائلة. ربط الحروف
                    والأرقام: صلاة، خلا، أميرة — ٠١٢٣٤٥٦٧٨٩ و 0123456789.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    نص ثانوي بحجم صغير — يُستخدم للأوصاف والمساعدات.
                  </p>
                </TabsContent>

                {/* ------------------------------ Buttons ------------------------------ */}
                <TabsContent value="buttons" className="mt-0 space-y-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button>أساسي</Button>
                    <Button variant="secondary">ثانوي</Button>
                    <Button variant="outline">محدد</Button>
                    <Button variant="ghost">شفاف</Button>
                    <Button variant="destructive">خطر</Button>
                    <Button variant="link">رابط</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="sm">صغير</Button>
                    <Button size="lg" className="rounded-full px-7">
                      كبير دائري
                    </Button>
                    <Button aria-disabled="true" onClick={() => undefined}>
                      معطّل
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    حلقة التركيز ظاهرة بلون العلامة — جرّب Tab عبر الأزرار.
                  </p>
                </TabsContent>

                {/* ------------------------------ Inputs ------------------------------ */}
                <TabsContent value="inputs" className="mt-0 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="pg-name">الاسم</Label>
                    <Input
                      id="pg-name"
                      placeholder="اكتب اسمك هنا"
                      className="bg-surface"
                    />
                    <p className="text-xs text-muted-foreground">
                      نص مساعد اختياري للحقل.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pg-error">رقم الهاتف</Label>
                    <Input
                      id="pg-error"
                      dir="ltr"
                      inputMode="tel"
                      aria-invalid="true"
                      aria-describedby="pg-error-msg"
                      placeholder="01xxxxxxxxx"
                      className="border-destructive bg-surface"
                    />
                    <p
                      id="pg-error-msg"
                      className="text-xs font-medium text-destructive"
                    >
                      يرجى إدخال رقم هاتف مصري صحيح مكون من 11 رقمًا.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pg-notes">ملاحظات</Label>
                    <Textarea
                      id="pg-notes"
                      rows={3}
                      placeholder="مثال: أفضّل التوصيل بعد العصر"
                      className="bg-surface"
                    />
                  </div>
                </TabsContent>

                {/* ------------------------------ Cards ------------------------------ */}
                <TabsContent value="cards" className="mt-0 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>بطاقة منتج توضيحية</CardTitle>
                        <CardDescription>
                          وصف قصير لبطاقة المنتج داخل المتجر.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex aspect-video items-center justify-center rounded-xl bg-surface-subtle text-sm text-muted-foreground">
                          مساحة الصورة
                        </div>
                      </CardContent>
                      <CardFooter className="flex items-center justify-between">
                        <span className="font-bold">349 ج.م</span>
                        <Badge>الأكثر مبيعًا</Badge>
                      </CardFooter>
                    </Card>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>افتراضي</Badge>
                        <Badge variant="secondary">ثانوي</Badge>
                        <Badge variant="outline">محدد</Badge>
                        <Badge variant="destructive">خطر</Badge>
                        <Badge className="bg-blush text-primary">بلّوش</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-success text-white">
                          متوفر
                        </Badge>
                        <Badge className="bg-warning text-foreground">
                          كمية محدودة
                        </Badge>
                        <Badge variant="destructive">نفدت الكمية</Badge>
                      </div>
                      <Separator />
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        الشارات تُستخدم لحالات المنتج والخصومات — بدون ألوان
                        صلبة خارج نظام الرموز.
                      </p>
                    </div>
                  </div>
                </TabsContent>

                {/* ------------------------------ Table ------------------------------ */}
                <TabsContent value="table" className="mt-0">
                  <div className="overflow-x-auto rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>المنتج</TableHead>
                          <TableHead>المقاس</TableHead>
                          <TableHead>السعر</TableHead>
                          <TableHead>الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {DEMO_ROWS.map((row, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              {row.name}
                            </TableCell>
                            <TableCell>{row.size}</TableCell>
                            <TableCell>{row.price}</TableCell>
                            <TableCell>
                              {row.status === "متاح" ? (
                                <Badge className="bg-success text-white">
                                  {row.status}
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  {row.status}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    بيانات عرض فقط — لا تمثل منتجات حقيقية. الجداول القابلة
                    للتمرير أفقياً داخل حاوية عند الشاشات الصغيرة.
                  </p>
                </TabsContent>

                {/* ------------------------------ States ------------------------------ */}
                <TabsContent value="states" className="mt-0 space-y-4">
                  <LoadingState label="جارٍ تحميل البيانات…" />
                  <EmptyState
                    icon={Inbox}
                    title="لا توجد عناصر بعد"
                    description="مثال على الحالة الفارغة التي تُعرض بدل المناطق البيضاء."
                  />
                  <ErrorState />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                  </div>
                </TabsContent>

                {/* ------------------------------ Alerts ------------------------------ */}
                <TabsContent value="alerts" className="mt-0 space-y-4">
                  <Alert>
                    <Star aria-hidden className="size-4" />
                    <AlertTitle>تنبيه معلوماتي</AlertTitle>
                    <AlertDescription>
                      يُستخدم لتوضيح معلومات مهمة للعميل داخل الصفحات.
                    </AlertDescription>
                  </Alert>
                  <Alert variant="destructive">
                    <Inbox aria-hidden className="size-4" />
                    <AlertTitle>تنبيه خطأ</AlertTitle>
                    <AlertDescription>
                      يُستخدم للأخطاء الحرجة مثل تعذر إتمام العملية.
                    </AlertDescription>
                  </Alert>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => showToast()}>إظهار تنبيه</Button>
                    <Button variant="destructive" onClick={() => showToast("destructive")}>
                      إظهار تنبيه خطأ
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline">فتح حوار تأكيد</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader className="text-start">
                          <AlertDialogTitle>
                            تأكيد التنفيذ (نموذج)
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            مثال على حوار التأكيد المستخدم في العمليات
                            الحساسة. البيانات هنا للعرض فقط.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-2 sm:justify-start">
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction onClick={() => showToast()}>
                            تأكيد
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
