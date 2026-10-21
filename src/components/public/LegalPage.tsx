import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { LEGAL_DOCS, type LegalDoc } from "@/lib/legal";
import { cn } from "@/lib/utils";

/** Cross-links to every legal document; the current one is marked as active. */
export function LegalNav({
  current,
  label = "Legal documents",
  className,
}: {
  current?: string;
  /** Landmarks must be uniquely labelled; two navs on one page need two names. */
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {LEGAL_DOCS.map((doc) => {
        const active = doc.slug === current;
        return (
          <Link
            key={doc.to}
            to={doc.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
            )}
          >
            {doc.short}
          </Link>
        );
      })}
    </nav>
  );
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <div>
      <section className="hero-glow relative border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:py-20">
          <Link
            to="/legal"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-4" /> Legal center
          </Link>
          <p className="eyebrow mt-6">Legal</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-extrabold tracking-tight leading-[0.95] text-balance sm:text-5xl">
            {doc.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{doc.summary}</p>
          <p className="mt-4 text-sm text-muted-foreground">Last updated {doc.updated}</p>
          <LegalNav current={doc.slug} className="mt-8" />
        </div>
      </section>

      <section className="section-band">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[240px_1fr] lg:items-start">
          <nav aria-label="On this page" className="hidden lg:sticky lg:top-24 lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              On this page
            </p>
            <ul className="mt-4 space-y-2 border-l border-border pl-4 text-sm">
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="text-muted-foreground transition-colors hover:text-primary"
                  >
                    {s.heading}
                  </a>
                </li>
              ))}
              {doc.contact && doc.contact.length > 0 && (
                <li>
                  <a
                    href="#contact"
                    className="text-muted-foreground transition-colors hover:text-primary"
                  >
                    Contact
                  </a>
                </li>
              )}
            </ul>
          </nav>

          <article className="max-w-3xl">
            {doc.sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24 pb-10">
                <h2 className="font-display text-2xl font-extrabold tracking-tight">{s.heading}</h2>
                {s.paragraphs?.map((p, i) => (
                  <p key={i} className="mt-4 leading-7 text-muted-foreground">
                    {p}
                  </p>
                ))}
                {s.bullets && s.bullets.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {s.bullets.map((b, i) => (
                      <li key={i} className="flex gap-3 leading-7 text-muted-foreground">
                        <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            {doc.contact && doc.contact.length > 0 && (
              <section id="contact" className="scroll-mt-24 pb-10">
                <h2 className="font-display text-2xl font-extrabold tracking-tight">Contact</h2>
                <p className="mt-4 leading-7 text-muted-foreground">
                  Questions about this document? Reach the right team:
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {doc.contact.map((c) => (
                    <a
                      key={c.email}
                      href={`mailto:${c.email}`}
                      className="glass-panel rounded-xl px-4 py-3 text-sm transition-colors hover:border-primary/50"
                    >
                      <span className="block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        {c.label}
                      </span>
                      <span className="mt-1 block font-medium text-foreground">{c.email}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}

            <div className="border-t border-border pt-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                More legal documents
              </p>
              <LegalNav current={doc.slug} label="More legal documents" className="mt-4" />
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
