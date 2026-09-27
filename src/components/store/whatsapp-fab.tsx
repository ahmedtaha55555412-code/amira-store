import { MessageCircle } from "lucide-react";
import { getBrandSettings } from "@/lib/branding";

/** Floating WhatsApp handoff — always reachable, respects safe areas. */
export function WhatsAppFloatingButton() {
  const settings = getBrandSettings();
  const waHref = `https://wa.me/${settings.whatsappPhone}`;

  return (
    <a
      href={waHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`تواصل معنا عبر واتساب (يفتح في نافذة جديدة)`}
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] start-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 sm:size-14"
    >
      <MessageCircle aria-hidden className="size-6" />
    </a>
  );
}
