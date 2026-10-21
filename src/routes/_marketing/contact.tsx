import { createFileRoute } from "@tanstack/react-router";
import { Check, Clock, ListChecks, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DMCA_AGENT, LEGAL_ADDRESS } from "@/lib/legal";
import { SUPPORT_EMAIL } from "@/lib/site-nav";

export const Route = createFileRoute("/_marketing/contact")({
  head: () => ({
    meta: [
      { title: "Contact Createtor - We read everything" },
      {
        name: "description",
        content:
          "Questions, billing issues or feature ideas for Createtor. Email us directly and we reply within 1-2 business days.",
      },
      { property: "og:title", content: "Contact Createtor" },
      {
        property: "og:description",
        content:
          "Questions, billing issues or feature ideas. Email support@createtor.xyz and we reply within 1-2 business days.",
      },
    ],
  }),
  component: ContactPage,
});

const SUBJECTS = [
  "Account or billing",
  "Technical help",
  "Feature request",
  "Partnership",
  "Something else",
];

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: SUBJECTS[0], message: "" });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    const message = form.message.trim();

    if (!name) return setError("Please add your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setError("Please use a valid email address.");
    if (message.length < 10) return setError("Tell us a little more — at least 10 characters.");

    const subject = encodeURIComponent(`[${form.subject}] ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    setError(null);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-5 py-20">
        <div className="glass-panel w-full rounded-2xl p-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-success/30 text-success-foreground">
            <Check className="size-7" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight leading-[0.88]">
            Message opened in your mail app.
          </h1>
          <p className="mt-3 text-muted-foreground">
            Your message is ready to send — just hit send. We reply to{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover-link">
              {SUPPORT_EMAIL}
            </a>{" "}
            within 1-2 business days.
          </p>
          <Button
            className="mt-7"
            variant="secondary"
            onClick={() => {
              setSent(false);
              setForm({ name: "", email: "", subject: SUBJECTS[0], message: "" });
            }}
          >
            Send another message
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <section className="hero-glow relative border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow">Contact</p>
            <h1 className="mt-5 font-display text-5xl font-extrabold tracking-tight leading-[0.88] sm:text-6xl">
              Get in touch.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              Questions, support, or feature ideas. A real person reads every message and replies
              within 1-2 business days.
            </p>
            <div className="mt-8 space-y-3">
              <SupportRow
                icon={Clock}
                title="Response time"
                body="1-2 business days, every message."
              />
              <SupportRow
                icon={ShieldCheck}
                title="No robots"
                body="Your email never feeds a ticket bot."
              />
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-card/60 p-5 text-sm">
              <p className="font-medium">Mailing address</p>
              <p className="mt-1 text-muted-foreground">{LEGAL_ADDRESS}</p>
              <p className="mt-4 font-medium">Copyright / DMCA notices</p>
              <p className="mt-1 text-muted-foreground">
                {DMCA_AGENT.name} ·{" "}
                <a href={`mailto:${DMCA_AGENT.email}`} className="text-primary hover-link">
                  {DMCA_AGENT.email}
                </a>
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="glass-panel space-y-5 rounded-2xl p-6"
            aria-label="Contact form"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Your full name</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <select
                id="subject"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              >
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                rows={5}
                className="min-h-32"
                placeholder="What can we help with?"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full">
              Send message
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Prefer your own app?{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover-link">
                Email us directly
              </a>{" "}
              instead.
            </p>
          </form>
        </div>
      </section>

      <section className="section-band">
        <div className="mx-auto max-w-7xl px-5">
          <div className="section-heading">
            <p className="eyebrow">What to include</p>
            <h2>One message is enough.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <article className="glass-panel rounded-2xl p-6">
              <ListChecks className="size-6 text-primary" />
              <h3 className="mt-4 font-display text-xl font-semibold">Billing or account</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                Tell us the email on the account and what you were doing when it happened. Credits
                are reserved before generations run, so we can trace any charge.
              </p>
            </article>
            <article className="glass-panel rounded-2xl p-6">
              <ListChecks className="size-6 text-primary" />
              <h3 className="mt-4 font-display text-xl font-semibold">Technical help</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                Add the page you were on and a couple of steps to reproduce. A short screen
                recording is the fastest way to get a fix.
              </p>
            </article>
            <article className="glass-panel rounded-2xl p-6">
              <ListChecks className="size-6 text-primary" />
              <h3 className="mt-4 font-display text-xl font-semibold">Feature ideas</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                Tell us the outcome you want, not just the button. Workflows beat widgets.
              </p>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}

function SupportRow({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Clock;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-mist text-primary">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
