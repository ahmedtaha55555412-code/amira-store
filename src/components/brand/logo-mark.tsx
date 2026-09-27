import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
  title?: string;
};

/**
 * The original default Amira Store mark (PHASE-01): a delicate crown with a
 * gold gem above a stylized Arabic alef (أميرة) on a soft blush tile with a
 * muted-gold inner frame.
 *
 * This component renders the DEFAULT mark only. When the Admin uploads a
 * custom logo (later phase), `BrandLogo` swaps it out — never hard-code this
 * component into feature UIs; use `BrandLogo` instead.
 */
export function LogoMark({ className, title = "شعار أميرة استور" }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <rect x="24" y="24" width="464" height="464" rx="116" fill="#F8ECEA" />
      <rect
        x="38"
        y="38"
        width="436"
        height="436"
        rx="104"
        fill="none"
        stroke="#C9A25E"
        strokeOpacity="0.55"
        strokeWidth="5"
      />
      <path
        d="M158 222 C158 170 186 154 210 180 C230 138 246 130 256 126 C266 130 282 138 302 180 C326 154 354 170 354 222"
        fill="none"
        stroke="#803049"
        strokeWidth="26"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="256" cy="86" r="16" fill="#C9A25E" />
      <rect x="238" y="234" width="36" height="206" rx="18" fill="#803049" />
    </svg>
  );
}
