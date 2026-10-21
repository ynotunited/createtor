import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_marketing/results")({
  head: () => ({
    meta: [
      { title: "Results - Createtor" },
      {
        name: "description",
        content:
          "Real channel results will be featured here as our first channels grow. Until then, see the pipeline that makes daily consistency repeatable.",
      },
      { property: "og:title", content: "Results | Createtor" },
      {
        property: "og:description",
        content:
          "What consistent daily posting looks like. Real channel data, featured as channels grow.",
      },
    ],
  }),
  component: ResultsPage,
});

const QUEUE = [
  {
    title: "Why budgeting fails in month two",
    status: "Publishing now",
    niche: "Personal finance",
  },
  {
    title: "The quiet math behind compound interest",
    status: "Ready for tomorrow",
    niche: "Personal finance",
  },
  {
    title: "Five money habits that survive payday",
    status: "Published today",
    niche: "Personal finance",
  },
  {
    title: "What debt-free actually changes",
    status: "Published yesterday",
    niche: "Personal finance",
  },
  { title: "How cartels actually started", status: "Draft — needs review", niche: "World history" },
];

const EVIDENCE = [
  {
    value: "365",
    label: "video slots a year",
    body: "One niche brief keeps the calendar full for an entire year without re-briefing the machine.",
  },
  {
    value: "0",
    label: "editing hours required",
    body: "Render happens in your browser. Music comes from uploads, and captions are burned in on export.",
  },
  {
    value: "1",
    label: "approval switch",
    body: "Leave review mode on for full control, or trust the queue and let scheduled videos go live.",
  },
];

function ResultsPage() {
  return (
    <div>
      <section className="hero-glow relative border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow">Results</p>
            <h1 className="mt-5 font-display text-5xl font-extrabold tracking-tight leading-[0.88] sm:text-6xl">
              What consistent daily posting looks like.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              We will not show you invented subscriber counts. Real channel data lands here as the
              first channels built on Createtor grow. Until then, here is the production pipeline
              that makes daily consistency repeatable.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start my channel <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/features">See the features</Link>
              </Button>
            </div>
          </div>

          <aside className="channel-card">
            <div className="flex items-center justify-between border-b border-border pb-5">
              <div>
                <p className="text-sm text-muted-foreground">A queue built while you sleep</p>
                <h2 className="font-display text-2xl font-extrabold">Daily queue</h2>
              </div>
              <span className="live-pill">Live</span>
            </div>
            <div className="space-y-3 py-5">
              {QUEUE.map((item, index) => (
                <div key={item.title} className="queue-row">
                  <span className="queue-index">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.status} · {item.niche}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="section-band">
        <div className="mx-auto max-w-7xl px-5">
          <div className="section-heading">
            <p className="eyebrow">The evidence</p>
            <h2>Consistency compounds. That is the whole bet.</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {EVIDENCE.map((item) => (
              <article key={item.label} className="process-panel">
                <p className="font-display text-5xl font-extrabold tabular-nums text-primary">
                  {item.value}
                </p>
                <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-4 text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-band border-t border-border">
        <div className="mx-auto max-w-7xl px-5">
          <div className="section-heading">
            <p className="eyebrow">Featured channels</p>
            <h2>No fake numbers. Real results coming soon.</h2>
            <p>
              The first channels built on Createtor are publishing now. When they have meaningful
              data, it will be shown here with the receipts — view counts, watch time and subscriber
              growth, unfiltered.
            </p>
          </div>
          <div className="glass-panel mt-12 rounded-2xl p-10 text-center">
            <Sparkles className="mx-auto size-8 text-primary" />
            <h3 className="mt-4 font-display text-2xl font-extrabold">
              Be one of the first channels featured.
            </h3>
            <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
              Your channel could be here. Setup takes minutes and your first video can be scheduled
              for tomorrow.
            </p>
            <div className="mt-7">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start my channel <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
