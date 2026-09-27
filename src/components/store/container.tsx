import { cn } from "@/lib/utils";

type ContainerProps = React.ComponentProps<"div">;

/**
 * Page-width container with responsive gutters.
 * Breakpoint contract (docs/DESIGN_SYSTEM.md): phone < 640 · large phone 640–767 ·
 * tablet 768–1023 · desktop 1024–1279 · large ≥ 1280.
 */
export function Container({ className, ...props }: ContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}
