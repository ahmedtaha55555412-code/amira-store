import { Sparkles } from "lucide-react";
import { getBrandSettings } from "@/lib/branding";
import { Container } from "./container";

/**
 * Top announcement/promotion bar — PHASE-10 (D-2): copy comes from
 * homepage_sections.announcement.config.message, falling back to the managed
 * BRAND default. Section visibility is admin-controlled: a disabled
 * announcement section removes the bar entirely.
 */
export async function AnnouncementBar() {
  const { announcement, announcementEnabled } = await getBrandSettings();
  if (!announcementEnabled) return null;

  return (
    <div className="bg-primary text-primary-foreground">
      <Container className="flex min-h-9 items-center justify-center gap-2 px-4 py-1.5 text-center">
        <Sparkles aria-hidden className="size-3.5 shrink-0 opacity-80" />
        <p className="text-xs leading-snug text-pretty sm:text-sm">{announcement}</p>
      </Container>
    </div>
  );
}
