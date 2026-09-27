import { Ruler } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SizeGuideViewProps = {
  guide: {
    title: string | null;
    notes: string | null;
    rows: Array<{ id: string; sizeLabel: string; measurements: Record<string, string> }>;
  };
};

/** Known measurement keys → Arabic labels; unknown keys fall back to the raw key. */
const MEASUREMENT_LABELS: Record<string, string> = {
  chest: "الصدر",
  waist: "الخصر",
  hips: "الورك",
  length: "الطول",
  shoulder: "الكتف",
  sleeve: "الكم",
};

/**
 * Optional per-product size guide (PHASE-05 task 11 — MASTER_PLAN §6:
 * clothing only, never forced on other categories).
 */
export function SizeGuideView({ guide }: SizeGuideViewProps) {
  const measurementKeys: string[] = [];
  for (const row of guide.rows) {
    for (const key of Object.keys(row.measurements)) {
      if (!measurementKeys.includes(key)) measurementKeys.push(key);
    }
  }

  return (
    <section aria-labelledby="size-guide-title" className="scroll-mt-24" id="size-guide">
      <div className="rounded-2xl border bg-surface p-5 sm:p-6">
        <h2 id="size-guide-title" className="mb-1 flex items-center gap-2 text-lg font-bold">
          <Ruler aria-hidden className="size-5 text-primary" />
          {guide.title ?? "دليل المقاسات"}
        </h2>
        {guide.notes ? (
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{guide.notes}</p>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            القياسات بالسنتيمتر تقريبية وقد تختلف باختلاف القماش.
          </p>
        )}

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-subtle/70">
                <TableHead className="text-start font-bold">المقاس</TableHead>
                {measurementKeys.map((key) => (
                  <TableHead key={key} className="text-start font-bold">
                    {MEASUREMENT_LABELS[key] ?? key}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {guide.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-bold">{row.sizeLabel}</TableCell>
                  {measurementKeys.map((key) => (
                    <TableCell key={key} className="text-muted-foreground">
                      {row.measurements[key] ?? "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
