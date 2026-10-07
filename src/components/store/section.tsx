import { cn } from "@/lib/utils";
import { Container } from "./container";

type SectionProps = React.ComponentProps<"section"> & {
  containerClassName?: string;
};

export function Section({ className, containerClassName, children, ...props }: SectionProps) {
  return (
    <section className={cn("py-10 sm:py-14 lg:py-16 xl:py-18", className)} {...props}>
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}

type SectionHeadingProps = {
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
        "mb-7 flex flex-col gap-3.5 sm:mb-9",
        align === "center" ? "items-center text-center" : "items-start text-start",
        action && "sm:flex-row sm:items-end sm:justify-between sm:gap-8",
        className,
      )}
    >
      <div
        className={cn(
          "flex max-w-2xl flex-col gap-2",
          align === "center" && "items-center",
        )}
      >
        {eyebrow ? (
          <span className="inline-flex items-center gap-2 text-xs font-extrabold text-gold-deep sm:text-sm">
            <span aria-hidden className="h-px w-7 bg-gold/80" />
            {eyebrow}
          </span>
        ) : null}
        <h2 id={id} className="text-2xl font-extrabold tracking-tight text-balance sm:text-3xl lg:text-[2.15rem]">
          {title}
        </h2>
        {description ? (
          <p className="max-w-xl text-sm leading-loose text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
