import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
  title?: string;
};

/**
 * The original default Amira Store mark (PHASE-01): a clear Arabic alef
 * monogram with a restrained champagne hamza, framed in the store palette.
 *
 * This component renders the DEFAULT mark only. `BrandLogo` switches to an
 * Admin-uploaded logo when one is configured.
 */
export function LogoMark({ className, title = "شعار أميرة استور" }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <rect x="20" y="20" width="472" height="472" rx="142" fill="#F8ECEA" />
      <rect
        x="34"
        y="34"
        width="444"
        height="444"
        rx="130"
        fill="none"
        stroke="#C9A25E"
        strokeOpacity="0.72"
        strokeWidth="4"
      />
      <circle cx="256" cy="256" r="166" fill="#803049" />
      <path
        d="M256 192v166"
        fill="none"
        stroke="#FFF9F4"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <path
        d="M178 166 163 128l41 21 52-43 52 43 41-21-15 38H178Z"
        fill="#D7B675"
        stroke="#803049"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M184 171h144"
        fill="none"
        stroke="#D7B675"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M222 390h68"
        fill="none"
        stroke="#D7B675"
        strokeWidth="10"
        strokeLinecap="round"
      />
    </svg>
  );
}
