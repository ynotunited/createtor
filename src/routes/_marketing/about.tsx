import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_marketing/about")({
  head: () => ({
    meta: [
      { title: "About Createtor - The machine that runs your channel" },
      {
        name: "description",
        content:
          "Createtor is a faceless video pipeline that writes, voices, builds and schedules a fresh video for your channel every day. No blank pages, no production team.",
      },
      { property: "og:title", content: "About Createtor" },
      {
        property: "og:description",
        content:
          "The machine that runs your channel. A fresh faceless video every day, editable before it publishes.",
      },
    ],
  }),
  component: AboutPage,
});

const PRINCIPLES = [
  {
    title: "Honest automation",
    body: "Every generation is a real model call with a credit cost shown before it runs. Nothing is staged, faked, or promised before it exists.",
  },
  {
    title: "Editable by default",
    body: "Every script, scene and storyboard is a project you can open and change. You stay the editor even when the queue builds the work.",
  },
  {
    title: "Rendering in your browser",
    body: "Final videos render with canvas, WebAudio and MediaRecorder client-side. No server ffmpeg queue, no black-box exports.",
  },
  {
    title: "No pretend features",
    body: "If a capability doesn’t exist yet, we say so. AI music is upload-based today, and the product is honest about that.",
  },
];

const PIPELINE = [
  { step: "01", label: "Research" },
  { step: "02", label: "Script" },
  { step: "03", label: "Storyboard" },
  { step: "04", label: "Voice & captions" },
  { step: "05", label: "Render" },
  { step: "06", label: "Publish" },
];

function AboutPage() {
  return (
    <div>
      <section className="hero-glow relative border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow">About us</p>
            <h1 className="mt-5 font-display text-5xl font-extrabold tracking-tight leading-[0.88] sm:text-6xl lg:text-7xl">
              We build the machine that runs your channel.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Createtor automates the daily production of faceless videos: topic research, scripts,
              storyboards, narration, captions, rendering and scheduling. You make the creative
              decisions once, and the pipeline keeps the channel moving.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start my channel <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/how-it-works">See how it works</Link>
              </Button>
            </div>
          </div>

          <div className="channel-card mt-14 max-w-3xl">
            <p className="text-sm text-muted-foreground">The daily pipeline</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {PIPELINE.map((item) => (
                <div
                  key={item.step}
                  className="rounded-xl border border-border bg-brand-mist/55 p-3"
                >
                  <span className="font-mono text-xs text-primary">{item.step}</span>
                  <p className="mt-1 text-sm font-medium">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="mx-auto max-w-7xl px-5">
          <div className="section-heading">
            <p className="eyebrow">Our mission</p>
            <h2>Consistent channels without the production scramble.</h2>
            <p>
              Most faceless channels die in week two. The scripting is slow, the rendering is
              fiddly, and the gap between videos widens until the channel stops. We built Createtor
              to make daily consistency the default — not the result of heroic effort.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <article key={p.title} className="glass-panel rounded-2xl p-7">
                <Check className="size-5 text-primary" />
                <h3 className="mt-4 font-display text-2xl font-extrabold">{p.title}</h3>
                <p className="mt-3 leading-7 text-muted-foreground">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="closing-band">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <p className="eyebrow justify-center">Built for creators</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight leading-[0.88] text-balance sm:text-5xl">
            Pick a niche once. Wake up to the next video already built.
          </h2>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Start my channel <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
