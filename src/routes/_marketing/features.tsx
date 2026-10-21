import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_marketing/features")({
  head: () => ({
    meta: [
      { title: "Features - Createtor" },
      {
        name: "description",
        content:
          "Seven automated systems working together: niche brief, daily research, script & storyboard studio, AI voiceover, captions, browser rendering and scheduling.",
      },
      { property: "og:title", content: "Features | Createtor" },
      {
        property: "og:description",
        content:
          "The machine that runs your channel. Seven automated systems working together so you never have to.",
      },
    ],
  }),
  component: FeaturesPage,
});

const FEATURES = [
  {
    number: "01",
    title: "Niche brief",
    heading: "One setup. Your channel forever.",
    body: "Set your niche, audience, visual style and AI voice once in the workspace. Every future video is drafted from that brief — no re-briefing, no missing context.",
    bullets: [
      "Persistent workspace settings",
      "Reusable voice & visual style",
      "Change direction anytime",
    ],
  },
  {
    number: "02",
    title: "Daily research & drafting",
    heading: "Fresh topics, every 24 hours.",
    body: "The queue researches current topics in your niche, checks what is already covered, and builds an original script from the brief.",
    bullets: [
      "Trend-aware topic ideas",
      "No repeats of covered topics",
      "Autopilot review mode optional",
    ],
  },
  {
    number: "03",
    title: "Script & storyboard studio",
    heading: "Editable projects, not one-shot videos.",
    body: "Scripts, storyboards and scene prompts are saved as projects you can open and rework. Approve content in review mode before it moves to production.",
    bullets: [
      "Script generation & rewriting",
      "Storyboard with scene prompts",
      "Approval before anything goes live",
    ],
  },
  {
    number: "04",
    title: "AI voiceover + auto captions",
    heading: "Professional narration, zero recording.",
    body: "Natural AI voices narrate from the script, and captions are generated and burned into the final render. Never touch a microphone.",
    bullets: ["Gateway TTS voiceover", "WebVTT caption sync", "Multiple voices in your library"],
  },
  {
    number: "05",
    title: "Scenes & media library",
    heading: "Generative scenes or your own media.",
    body: "Generate on-brief scene images, upload clips, audio and music, and keep everything in a library your projects share.",
    bullets: [
      "Credit-priced scene generation",
      "Upload images, video, audio",
      "Shared asset library",
    ],
  },
  {
    number: "06",
    title: "Browser final rendering",
    heading: "Real rendering, no black box.",
    body: "Final videos assemble in your browser with canvas, WebAudio and MediaRecorder. Music is upload-based and captions are burned in on export.",
    bullets: [
      "Client-side render, no ffmpeg queue",
      "Uploaded music with ducking",
      "MP4/WebM export",
    ],
  },
  {
    number: "07",
    title: "Scheduling & publishing",
    heading: "Post when your audience is watching.",
    body: "Finished videos move into the publishing queue with metadata attached. Trust the schedule, or review first — either way, gaps show up on a calendar.",
    bullets: [
      "Calendar-first publishing queue",
      "Autopilot scheduling",
      "YouTube-first publishing",
    ],
  },
];

function FeaturesPage() {
  return (
    <div>
      <section className="hero-glow relative border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow">Features</p>
            <h1 className="mt-5 font-display text-5xl font-extrabold tracking-tight leading-[0.88] sm:text-6xl">
              The machine that runs your channel.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Seven systems working together so a video exists for your channel every day — from one
              niche brief to a scheduled upload.
            </p>
          </div>
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {FEATURES.map((f) => (
              <button
                key={f.number}
                onClick={() =>
                  document
                    .getElementById(`feature-${f.number}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
                className="rounded-xl border border-border bg-white/70 p-3 text-left transition-colors hover:border-primary/40 hover:bg-brand-mist/70"
              >
                <span className="font-mono text-xs text-primary">{f.number}</span>
                <p className="mt-1 text-sm font-medium">{f.title}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="divide-y divide-border">
        {FEATURES.map((f, index) => (
          <section key={f.number} id={`feature-${f.number}`} className="scroll-mt-24 section-band">
            <div
              className={`mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-2 ${
                index % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div>
                <p className="font-mono text-sm text-primary">{f.number}</p>
                <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight leading-[0.88]">
                  {f.heading}
                </h2>
                <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">{f.body}</p>
                <ul className="mt-6 space-y-3">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex gap-3 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <Panel index={index} />
            </div>
          </section>
        ))}
      </div>

      <section className="closing-band">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <p className="eyebrow justify-center">All seven, running together</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight leading-[0.88] text-balance sm:text-5xl">
            Pick a plan and your channel starts tomorrow.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/pricing">
                See pricing <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/how-it-works">
                <PlayCircle className="mr-2 size-4" /> How it works
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Panel({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="glass-panel rounded-2xl p-5">
        <p className="text-sm text-muted-foreground">Workspace brief</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Personal finance", "World history", "Psychology", "Health education"].map((n) => (
            <span
              key={n}
              className="rounded-full border border-border bg-white/70 px-3 py-1 text-xs"
            >
              {n}
            </span>
          ))}
        </div>
        <div className="mt-4 grid gap-3">
          <div className="rounded-xl border border-border bg-brand-mist/55 p-3 text-sm">
            <span className="text-muted-foreground">Voice</span>
            <p className="mt-0.5 font-medium">Ade · warm, Mid-Atlantic English</p>
          </div>
          <div className="rounded-xl border border-border bg-brand-mist/55 p-3 text-sm">
            <span className="text-muted-foreground">Visual style</span>
            <p className="mt-0.5 font-medium">Cinematic · clean text · quiet background</p>
          </div>
        </div>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="glass-panel space-y-3 rounded-2xl p-5">
        {[
          { t: "Why budgeting fails in month two", s: "Research complete" },
          { t: "The quiet math behind compound interest", s: "Script drafted" },
          { t: "Five money habits that survive payday", s: "Drafting now" },
        ].map((r) => (
          <div key={r.t} className="queue-row">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.t}</p>
              <p className="text-sm text-muted-foreground">{r.s}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className="glass-panel rounded-2xl p-5">
        <p className="text-sm text-muted-foreground">Storyboard — scene 03 of 07</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {["A", "B", "C"].map((s) => (
            <div
              key={s}
              className="grid aspect-video place-items-center rounded-xl bg-gradient-to-br from-brand-mist to-accent font-display text-lg font-semibold text-primary"
            >
              {s}
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Scene prompt: a quiet office desk with a single ledger open, soft daylight from the
          window.
        </p>
      </div>
    );
  }
  if (index === 3) {
    return (
      <div className="glass-panel rounded-2xl p-5">
        <p className="text-sm text-muted-foreground">Narration + captions</p>
        <div className="mt-4 space-y-2">
          {[
            "The math is not complicated.",
            "It compounds quietly, in the background.",
            "That is where the discipline lives.",
          ].map((line, i) => (
            <p
              key={line}
              className="rounded-lg border border-border bg-brand-mist/55 px-3 py-2 text-sm"
            >
              <span className="mr-2 font-mono text-xs text-primary">{i + 1}</span>
              {line}
            </p>
          ))}
        </div>
      </div>
    );
  }
  if (index === 4) {
    return (
      <div className="glass-panel rounded-2xl p-5">
        <p className="text-sm text-muted-foreground">Media library</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="grid aspect-square place-items-center rounded-xl bg-gradient-to-br from-brand-secondary/25 to-accent/60 font-mono text-xs text-muted-foreground"
            >
              {["IMG", "CLP", "AUD", "IMG", "CLP", "AUD"][i]}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (index === 5) {
    return (
      <div className="glass-panel rounded-2xl p-5">
        <p className="text-sm text-muted-foreground">Final render timeline</p>
        <div className="mt-4 space-y-3">
          {[
            { l: "Scene 01 — still", d: "8s" },
            { l: "Voiceover", d: "24s" },
            { l: "Scene 02 — clip", d: "12s" },
            { l: "Music (upload)", d: "24s" },
          ].map((row) => (
            <div
              key={row.l}
              className="flex items-center justify-between rounded-lg border border-border bg-brand-mist/55 px-3 py-2 text-sm"
            >
              <span className="font-medium">{row.l}</span>
              <span className="font-mono text-xs text-muted-foreground">{row.d}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="glass-panel rounded-2xl p-5">
      <p className="text-sm text-muted-foreground">October 2026</p>
      <div className="mt-4 grid grid-cols-7 gap-2 text-center text-[11px] text-muted-foreground">
        {["M", "T", "W", "T", "F", "S", "S"].map((d) => (
          <span key={d}>{d}</span>
        ))}
        {Array.from({ length: 28 }, (_, i) => (
          <span key={i} className={i < 24 ? "calendar-day active" : "calendar-day"}>
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}
