import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_marketing/how-it-works")({
  head: () => ({
    meta: [
      { title: "How It Works - Createtor" },
      {
        name: "description",
        content:
          "From niche brief to a published video every day. Set your channel once, review or hands-off, and wake up to the next video already built.",
      },
      { property: "og:title", content: "How It Works | Createtor" },
      {
        property: "og:description",
        content:
          "You make one decision. Createtor researches, writes, voices, renders and schedules the rest — every single day.",
      },
    ],
  }),
  component: HowItWorksPage,
});

const STEPS = [
  {
    number: "01",
    eyebrow: "Set your niche",
    title: "Five minutes of setup. Then never again.",
    body: "Tell the workspace what the channel is about — personal finance, world history, tech, psychology, fitness — then pick the visual style, tone and AI voice. That brief travels with every future video.",
    points: [
      "Niche, audience and language",
      "Visual style and pacing",
      "The AI voice for every narration",
    ],
  },
  {
    number: "02",
    eyebrow: "The daily build",
    title: "Research to publish-ready in one pass.",
    body: "Every day the queue researches fresh topics, writes an original script, plans the storyboard with scene prompts, records narration, adds captions, and assembles the final video in your browser.",
    points: [
      "Fresh topics in your niche",
      "Editable script and storyboard",
      "Narration, captions and render",
    ],
  },
  {
    number: "03",
    eyebrow: "Publish",
    title: "On time, every time. On your terms.",
    body: "Finished videos move to the publishing queue with metadata ready. Leave autopilot on schedule, or switch on review mode to approve each upload before it goes live.",
    points: [
      "Scheduled uploads from the calendar",
      "Review mode for full control",
      "Gaps visible instantly",
    ],
  },
];

const PIPELINE = ["Research", "Script", "Storyboard", "Voice", "Captions", "Render", "Publish"];

const CHECKLIST = [
  "Daily topic research for the selected niche",
  "Script, storyboard and scene prompts saved as a project",
  "Voiceover and captions generated from the final script",
  "Browser-based final rendering with uploaded music or clips",
  "Approval mode before anything goes live",
];

function HowItWorksPage() {
  return (
    <div>
      <section className="hero-glow relative border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow">How it works</p>
            <h1 className="mt-5 font-display text-5xl font-extrabold tracking-tight leading-[0.88] sm:text-6xl">
              From niche to published. Automatically, every day.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              You make one decision about what the channel is. The machine handles the daily
              production of research, script, storyboard, voiceover, captions, rendering and
              publishing.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start my channel <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/pricing">
                  <PlayCircle className="mr-2 size-4" /> See pricing
                </Link>
              </Button>
            </div>
          </div>

          <div className="channel-card mt-14 max-w-4xl">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-extrabold">One queue, seven stages</p>
              <span className="live-pill">Runs daily</span>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-7">
              {PIPELINE.map((stage, i) => (
                <div
                  key={stage}
                  className="rounded-xl border border-border bg-brand-mist/55 p-3 text-center"
                >
                  <span className="font-mono text-xs text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-1 text-sm font-medium">{stage}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="mx-auto max-w-7xl px-5">
          <div className="space-y-6">
            {STEPS.map((step) => (
              <article
                key={step.number}
                className="glass-panel grid gap-8 rounded-2xl p-8 lg:grid-cols-[0.35fr_1fr]"
              >
                <div>
                  <span className="font-mono text-lg text-primary">{step.number}</span>
                  <p className="mt-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {step.eyebrow}
                  </p>
                  <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight leading-[0.88]">
                    {step.title}
                  </h2>
                </div>
                <div>
                  <p className="max-w-2xl text-lg leading-8 text-muted-foreground">{step.body}</p>
                  <ul className="mt-5 space-y-3">
                    {step.points.map((point) => (
                      <li key={point} className="flex gap-3 text-sm text-muted-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-band border-t border-border">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="section-heading">
            <p className="eyebrow">What you get</p>
            <h2>Wake up to the next video already built.</h2>
            <p>
              No blank pages, no production scramble, no decision fatigue. Just a queue that keeps
              moving and a calendar that shows gaps honestly.
            </p>
          </div>
          <div className="calendar-panel">
            <ul className="grid gap-3 sm:grid-cols-2">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-muted-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="closing-band">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <p className="eyebrow justify-center">Ready when you are</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight leading-[0.88] text-balance sm:text-5xl">
            Setup takes minutes. Your first video can post tomorrow.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
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
      </section>
    </div>
  );
}
