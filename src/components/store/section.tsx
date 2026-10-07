import { cn } from "@/lib/utils";
import { Container } from "./container";

type SectionProps = React.ComponentProps<"section"> & {
  containerClassName?: string;
};

/** Full-width page section with responsive vertical rhythm + inner container. */
export function Section({ className, containerClassName, children, ...props }: SectionProps) {
  return (
    <section className={cn("py-12 sm:py-16 lg:py-20", className)} {...props}>
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}

type SectionHeadingProps = {
  /** id applied to the h2 (use with aria-labelledby on the section). */
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  align?: "center" | "start";
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = "center",
  id,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-4 sm:mb-12",
        align === "center" ? "items-center text-center" : "items-start text-start",
        action && "sm:flex-row sm:items-end sm:justify-between sm:gap-8",
        className
      )}
    >
      <div
        className={cn(
          "flex max-w-2xl flex-col gap-2.5",
          align === "center" && "items-center"
        )}
      >
        {eyebrow ? (
          <span className="text-sm font-bold text-gold-deep">
            <span aria-hidden>✦ </span>
            {eyebrow}
          </span>
        ) : null}
        <h2 id={id} className="text-2xl font-bold sm:text-3xl lg:text-4xl">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-loose text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
