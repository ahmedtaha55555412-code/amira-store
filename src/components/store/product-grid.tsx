import { cn } from "@/lib/utils";

type ProductGridProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Responsive product grid (phone 2-up → tablet 3-up → desktop 4-up).
 * Category pages narrow the main column with a filter sidebar and pass a
 * variant className when a different rhythm is needed.
 */
export function ProductGrid({ children, className }: ProductGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}
