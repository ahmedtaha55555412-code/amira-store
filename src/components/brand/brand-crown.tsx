import { cn } from "@/lib/utils";

type BrandCrownProps = {
  className?: string;
};

export function BrandCrown({ className }: BrandCrownProps) {
  return (
    <svg
      viewBox="0 0 64 48"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <path
        d="m6.5 12.5 11.2 8.1 7.5-13.1L32 19l6.8-11.5 7.5 13.1 11.2-8.1-5 26H11.5l-5-26Z"
        fill="#D7B675"
        stroke="#9B743C"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      <path
        d="M13.5 32.5h37"
        fill="none"
        stroke="#FFF9F4"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
