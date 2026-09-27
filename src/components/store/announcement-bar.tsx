import { Sparkles } from "lucide-react";
import { getBrandSettings } from "@/lib/branding";
import { Container } from "./container";

/** Top announcement/promotion bar — copy is a managed default (Admin later). */
export function AnnouncementBar() {
  const { announcement } = getBrandSettings();

  return (
    <div className="bg-primary text-primary-foreground">
      <Container className="flex min-h-9 items-center justify-center gap-2 px-4 py-1.5 text-center">
        <Sparkles aria-hidden className="size-3.5 shrink-0 opacity-80" />
        <p className="text-xs leading-snug text-pretty sm:text-sm">{announcement}</p>
      </Container>
    </div>
  );
}
