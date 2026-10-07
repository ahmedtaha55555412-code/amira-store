import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
  title?: string;
};

/** Compact Amira Store crown + alef mark for favicon/compact placements. */
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
      <circle cx="256" cy="278" r="136" fill="#803049" />
      <path
        d="M256 216v152"
        fill="none"
        stroke="#FFF9F4"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <path
        d="M150 166 126 103l78 41 52-72 52 72 78-41-24 63H150Z"
        fill="#D7B675"
        stroke="#803049"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        d="M150 168h212"
        fill="none"
        stroke="#D7B675"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <circle cx="126" cy="101" r="10" fill="#D7B675" />
      <circle cx="256" cy="70" r="10" fill="#D7B675" />
      <circle cx="386" cy="101" r="10" fill="#D7B675" />
    </svg>
  );
}
