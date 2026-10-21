import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LEGAL_DOCS, LEGAL_UPDATED } from "@/lib/legal";

export const Route = createFileRoute("/_marketing/legal")({
  head: () => ({
    meta: [
      { title: "Legal center — Createtor" },
      {
        name: "description",
        content:
          "Privacy, terms, data and compliance, intellectual property and other policies for Createtor.",
      },
      { property: "og:title", content: "Legal center — Createtor" },
      {
        property: "og:description",
        content: "Every Createtor policy in one place: privacy, terms, compliance and more.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LegalHub,
});

function LegalHub() {
  return (
    <div>
      <section className="hero-glow relative border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow">Legal center</p>
            <h1 className="mt-5 font-display text-5xl font-extrabold tracking-tight leading-[0.9] text-balance sm:text-6xl">
              The fine print, made readable.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              How we handle your data, the rules for using the service, and how to reach us about
              privacy, security or intellectual property. Written in plain language, updated as the
              product changes.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" /> Last updated {LEGAL_UPDATED}
            </p>
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {LEGAL_DOCS.map((doc) => (
              <Link
                key={doc.to}
                to={doc.to}
                className="glass-panel group rounded-2xl p-7 transition-colors hover:border-primary/50"
              >
                <h2 className="font-display text-xl font-extrabold tracking-tight">{doc.title}</h2>
                <p className="mt-3 leading-7 text-muted-foreground">{doc.summary}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  Read
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="closing-band">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <p className="eyebrow justify-center">Still have questions?</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight leading-[0.9] text-balance sm:text-5xl">
            Talk to a human.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Our team reads every message, whether it is a billing question or a data request.
          </p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link to="/contact">
                Contact us <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
