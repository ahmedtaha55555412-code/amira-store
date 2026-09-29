import Link from "next/link";
import { Container } from "./container";

/**
 * Shared shell for the policy pages (PHASE-10): consistent premium reading
 * layout on the storefront. The content itself is store-controlled factual
 * copy; legal review before launch is documented in EXECUTION_STATUS.md.
 */
export function PolicyShell({
  title,
  intro,
  sections,
  updatedAt,
}: {
  title: string;
  intro: string;
  /** Numbered content blocks: heading + paragraphs / list items. */
  sections: Array<{
    heading: string;
    paragraphs?: string[];
    bullets?: string[];
  }>;
  updatedAt: string;
}) {
  return (
    <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
      <Container className="py-12 sm:py-16">
        <article className="mx-auto flex max-w-2xl flex-col gap-8">
          <header className="flex flex-col gap-3">
            <h1 className="text-3xl font-extrabold text-balance sm:text-4xl">
              {title}
            </h1>
            <p className="text-sm leading-loose text-muted-foreground sm:text-base">
              {intro}
            </p>
            <p className="text-xs text-muted-foreground">
              آخر تحديث: {updatedAt}
            </p>
          </header>

          <div className="flex flex-col gap-8">
            {sections.map((section) => (
              <section key={section.heading} aria-label={section.heading}>
                <h2 className="text-lg font-bold sm:text-xl">{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p
                    key={paragraph.slice(0, 24)}
                    className="mt-3 text-sm leading-loose text-muted-foreground sm:text-base"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.bullets ? (
                  <ul className="mt-3 flex flex-col gap-2">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet.slice(0, 24)}
                        className="flex items-start gap-2 text-sm leading-loose text-muted-foreground sm:text-base"
                      >
                        <span
                          aria-hidden
                          className="mt-3 size-1.5 shrink-0 rounded-full bg-gold"
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          <footer className="mt-4 flex flex-wrap gap-3 border-t pt-6 text-sm">
            <Link
              href="/policies/privacy"
              className="text-primary underline-offset-4 hover:underline"
            >
              سياسة الخصوصية
            </Link>
            <Link
              href="/policies/terms"
              className="text-primary underline-offset-4 hover:underline"
            >
              الشروط والأحكام
            </Link>
            <Link
              href="/policies/shipping"
              className="text-primary underline-offset-4 hover:underline"
            >
              سياسة الشحن
            </Link>
          </footer>
        </article>
      </Container>
    </main>
  );
}
