import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Menu,
  PlayCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { PricingCards } from "@/components/public/PricingCards";
import { SiteFooter } from "@/components/public/SiteFooter";
import { SkipLink } from "@/components/SkipLink";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { SITE_LINKS, SUPPORT_EMAIL } from "@/lib/site-nav";

const NAV_LINKS = SITE_LINKS;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Createtor - A new video on your channel every day" },
      {
        name: "description",
        content:
          "Set your niche once. Createtor writes, voices, builds and schedules faceless videos for your channel.",
      },
      {
        property: "og:title",
        content: "Createtor - A new video on your channel every day",
      },
      {
        property: "og:description",
        content: "Daily faceless video creation for creators who want a channel that keeps moving.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Createtor",
          url: "https://createtor.xyz",
          email: SUPPORT_EMAIL,
          description:
            "Automated faceless video creation, scheduling and publishing for creator channels.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Createtor",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: "https://createtor.xyz",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
            description: "Free plan with 1,000 credits every month, no card required.",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: QUESTIONS.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }),
      },
    ],
  }),
  component: Landing,
});

const CHANNEL_QUEUE = [
  { title: "Why budgeting fails in month two", status: "Publishing now" },
  { title: "The quiet math behind compound interest", status: "Ready for tomorrow" },
  { title: "Five money habits that survive payday", status: "Published today" },
  { title: "What debt-free actually changes", status: "Published yesterday" },
];

const NICHES = [
  "Personal finance",
  "World history",
  "Psychology",
  "Self improvement",
  "Health education",
  "Tech explainers",
  "Science facts",
  "Business stories",
];

const PROCESS = [
  {
    step: "01",
    title: "Pick a channel direction.",
    body: "Choose the niche, audience, pacing, voice and publishing cadence once. The workspace keeps that brief for every future video.",
  },
  {
    step: "02",
    title: "Review the daily build.",
    body: "Createtor drafts the topic, script, scenes, captions and voiceover. Keep approval on, or let trusted channels run on schedule.",
  },
  {
    step: "03",
    title: "Publish from the calendar.",
    body: "Finished videos move into the posting queue with metadata and captions attached, ready for YouTube-first publishing.",
  },
];

const AUTOMATION = [
  "Daily topic research for the selected niche",
  "Script, storyboard and scene prompts saved as a project",
  "Voiceover and captions generated from the final script",
  "Browser-based final rendering with uploaded music or clips",
  "Approval mode before anything goes live",
];

const QUESTIONS = [
  {
    q: "Do I need to pay to start?",
    a: "No. The Free plan gives you 1,000 credits every month with no card required. Paid plans add more credits, channels and storage, and yearly billing saves two months.",
  },
  {
    q: "Is this only for faceless channels?",
    a: "That is the core automated workflow. You can also upload custom footage, characters, and assets, but Createtor is built specifically so that repeatable narrated video channels can run on autopilot.",
  },
  {
    q: "Do I need my own API keys or technical setup?",
    a: "None at all. Everything runs directly inside Createtor out of the box — text generation, voiceovers, rendering, captions, and scheduling. No developer keys or terminal commands needed.",
  },
  {
    q: "Does it post without my review?",
    a: "Only if you turn on fully autonomous publishing. By default, every generated video waits in your queue for one-click review and approval before scheduling.",
  },
  {
    q: "Can I monetize videos made with Createtor?",
    a: "Yes, 100%. Videos generated on Createtor belong entirely to you and are fully eligible for YouTube partner monetization, TikTok creator funds, and ad revenue across all supported platforms.",
  },
  {
    q: "Are the generated videos unique?",
    a: "Yes. Every script, scene breakdown, and visual layout is uniquely synthesised based on your specific niche brief, style guidelines, and creative direction.",
  },
  {
    q: "Which platforms does it post to?",
    a: "Createtor connects directly with YouTube Shorts & longform, TikTok, Instagram Reels, Facebook Reels, and Pinterest with automated aspect-ratio adjustments.",
  },
  {
    q: "Can I edit a video after it is made?",
    a: "Yes. The Studio timeline gives you complete control over script text, voice selection, scene media, subtitles, timing, and uploaded music before exporting.",
  },
  {
    q: "Where does the final video render happen?",
    a: "Directly in your browser using modern WebAudio and canvas acceleration. No server wait times or third-party cloud queues.",
  },
  {
    q: "Do I own the videos?",
    a: "Yes. All videos, scripts, and media generated under your account are your commercial property to publish, monetize, and distribute however you like.",
  },
];

function Landing() {
  const { user } = useAuth();

  // Dynamic countdown timer for next upload
  const [secondsLeft, setSecondsLeft] = useState(86340); // ~23:59:00
  const [progress, setProgress] = useState(72);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 86400));
    }, 1000);

    const progressTimer = setInterval(() => {
      setProgress((prev) => (prev >= 98 ? 45 : prev + 1));
    }, 2500);

    return () => {
      clearInterval(timer);
      clearInterval(progressTimer);
    };
  }, []);

  const formatCountdown = (totalSecs: number) => {
    const h = String(Math.floor(totalSecs / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, "0");
    const s = String(totalSecs % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const cta = user ? (
    <Button asChild size="lg">
      <Link to="/dashboard">
        Open workspace <ArrowRight className="ml-2 size-4" />
      </Link>
    </Button>
  ) : (
    <Button asChild size="lg">
      <Link to="/auth" search={{ mode: "signup" }}>
        Start my channel <ArrowRight className="ml-2 size-4" />
      </Link>
    </Button>
  );

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <SkipLink />
      <header className="sticky top-0 z-40 border-b border-border bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="hover-link">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {NAV_LINKS.map((link) => (
                  <DropdownMenuItem key={link.to} asChild>
                    <Link to={link.to}>{link.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {user ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Workspace</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Start
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="relative">
          <div className="noise-layer" />
          <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-24">
            <div className="max-w-3xl">
              <p className="eyebrow">Posting to a channel right now</p>
              <h1 className="mt-5 max-w-4xl font-display text-5xl font-extrabold tracking-tight leading-[0.88] text-balance sm:text-6xl lg:text-7xl">
                A new video on your channel. <span className="text-gradient">Every day.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-xl font-light leading-8 text-muted-foreground">
                Pick your niche once. Createtor writes, voices, builds and queues a fresh faceless
                video for your channel without starting from a blank page every morning.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                {cta}
                <Button asChild size="lg" variant="secondary">
                  <a href="#process">
                    <PlayCircle className="mr-2 size-4" /> See the process
                  </a>
                </Button>
              </div>
              <div className="mt-10 grid max-w-xl grid-cols-3 border-y border-border py-5">
                <Metric value="365" label="videos / year" />
                <Metric value="0" label="editing hours" />
                <Metric value="1" label="niche brief" />
              </div>
            </div>

            <aside className="channel-card">
              <div className="flex items-center justify-between border-b border-border pb-5">
                <div>
                  <p className="text-sm text-muted-foreground">Your channel</p>
                  <h2 className="font-display text-2xl font-extrabold tracking-tight">
                    Daily queue
                  </h2>
                </div>
                <span className="live-pill">
                  <span className="live-pill-dot">
                    <span className="live-pill-ping" />
                  </span>
                  Live
                </span>
              </div>
              <div className="space-y-3 py-5">
                {CHANNEL_QUEUE.map((item, index) => {
                  const isPublishing = index === 0;
                  return (
                    <div
                      key={item.title}
                      className={`queue-row ${isPublishing ? "queue-row--active" : ""}`}
                    >
                      {/* Active progress bar that fills up smoothly */}
                      {isPublishing && (
                        <div className="queue-progress-bar" style={{ width: `${progress}%` }} />
                      )}
                      <span className={`queue-index ${isPublishing ? "queue-index--active" : ""}`}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-medium">{item.title}</p>
                          {isPublishing && (
                            <span className="shrink-0 text-xs font-bold text-primary font-mono tabular-nums">
                              {progress}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {isPublishing && (
                            <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
                          )}
                          <span>
                            {isPublishing ? `Publishing now (${progress}% rendered)` : item.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-xl border border-border bg-brand-mist/55 p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Next scheduled upload</span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <Sparkles className="size-3" /> Auto-sync
                  </span>
                </div>
                <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-foreground tracking-tight">
                  {formatCountdown(secondsLeft)}
                </p>
              </div>
            </aside>
          </div>
          <section className="niche-section" aria-label="Supported channel niches">
            <div className="niche-strip">
              {[...NICHES, ...NICHES].map((niche, index) => (
                <span key={`${niche}-${index}`}>{niche}</span>
              ))}
            </div>
          </section>
        </section>

        <section id="process" className="section-band">
          <div className="mx-auto max-w-7xl px-5">
            <div className="section-heading">
              <p className="eyebrow">The process</p>
              <h2>Set it once, then keep the channel moving.</h2>
            </div>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {PROCESS.map((item) => (
                <article key={item.step} className="process-panel">
                  <span>{item.step}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="automation" className="section-band border-t border-border">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="section-heading">
              <p className="eyebrow">Daily automation</p>
              <h2>Faceless videos without the production scramble.</h2>
              <p>
                The app is built around repeatable channel operations: a brief, a queue, editable
                scenes, generated narration and a calendar that makes gaps obvious.
              </p>
            </div>
            <div className="calendar-panel">
              <div className="flex items-center justify-between">
                <p className="font-display text-xl font-semibold">October 2026</p>
                <span className="text-sm text-muted-foreground">Video posted</span>
              </div>
              <div className="mt-6 grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <span key={day} className="font-semibold text-foreground/70">
                    {day}
                  </span>
                ))}
                {Array.from({ length: 31 }, (_, i) => {
                  const dayNum = i + 1;
                  const isToday = dayNum === 15;
                  const isPast = dayNum < 15;
                  const dayClass = isToday
                    ? "calendar-day today"
                    : isPast
                      ? "calendar-day active"
                      : "calendar-day";

                  return (
                    <span
                      key={i}
                      className={dayClass}
                      title={
                        isToday ? "Today — Scheduled & Publishing" : isPast ? "Published" : "Queued"
                      }
                    >
                      {dayNum}
                    </span>
                  );
                })}
              </div>
              <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                {AUTOMATION.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="pricing" className="section-band border-t border-border">
          <div className="mx-auto max-w-7xl px-5">
            {/* Eyebrow pill */}
            <div className="flex justify-center">
              <span className="pricing-eyebrow-pill">↑ Pricing</span>
            </div>

            {/* Heading */}
            <h2 className="mt-5 text-center font-display text-4xl font-extrabold tracking-tight leading-[0.88] text-balance sm:text-5xl">
              Pick your plan. <br className="hidden sm:block" />
              <span className="text-gradient">Start creating today.</span>
            </h2>

            {/* Sub-heading */}
            <p className="mx-auto mt-4 max-w-xl text-center text-base text-muted-foreground">
              Simple plans for solo creators, growing channels, and busy agencies. Cancel anytime.{" "}
              <span className="font-semibold text-foreground">2 months free</span> on yearly.
            </p>

            {/* Scarcity / urgency pill */}
            <div className="mt-5 flex justify-center">
              <span className="pricing-urgency-pill">
                🔥 &nbsp;Limited early-access pricing — lock in your rate now
              </span>
            </div>

            <PricingCards className="mt-10" />
          </div>
        </section>

        <section id="questions" className="section-band border-t border-border">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            {/* Left Column: Eyebrow pill, Punchy Brodcastr-style Heading, Subtitle & Support Link */}
            <div className="lg:sticky lg:top-28">
              <span className="faq-eyebrow-pill">
                <span className="size-1.5 rounded-full bg-primary" />
                FAQS
              </span>

              <h2 className="mt-5 font-display text-4xl font-extrabold tracking-tight leading-[0.92] text-foreground sm:text-5xl lg:text-6xl">
                Questions? <br />
                <span className="text-gradient">We have</span> <br />
                <span className="text-gradient">answers.</span>
              </h2>

              <p className="mt-6 text-base text-muted-foreground">
                Still unsure? Our team reads every message.
              </p>

              <div className="mt-4">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="group inline-flex items-center gap-2 text-base font-bold text-primary transition-colors hover:underline"
                >
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  <span>{SUPPORT_EMAIL}</span>
                </a>
              </div>
            </div>

            {/* Right Column: Pill Accordion Items */}
            <div>
              <Accordion type="single" collapsible className="space-y-3">
                {QUESTIONS.map((item, index) => (
                  <AccordionItem key={item.q} value={`item-${index}`} className="faq-pill-item">
                    <AccordionTrigger className="py-4 hover:no-underline [&>svg]:hidden">
                      <span className="pr-4 text-left font-display text-base font-extrabold tracking-tight text-foreground sm:text-lg">
                        {item.q}
                      </span>
                      <span className="faq-chevron-box shrink-0">
                        <ChevronDown className="size-4 transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 pt-1 text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        <section className="closing-band">
          <div className="mx-auto max-w-6xl px-5">
            <div className="guarantee-card p-7 sm:p-10 lg:p-14">
              {/* Subtle top-left radial glow for depth */}
              <div
                className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full opacity-30 blur-3xl"
                style={{ background: "radial-gradient(circle, #c36f09 0%, transparent 70%)" }}
                aria-hidden="true"
              />

              <div className="relative flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
                {/* Left side: Circular 7-Day Guarantee Badge + Copy */}
                <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:text-left lg:gap-8">
                  {/* Circular badge */}
                  <div className="relative shrink-0">
                    <div className="guarantee-badge-ring" />
                    <div className="guarantee-badge-outer">
                      <ShieldCheck
                        className="size-6 text-white/90 drop-shadow-sm"
                        strokeWidth={2.2}
                      />
                      <span className="mt-0.5 font-display text-2xl font-extrabold leading-none text-white tracking-tight">
                        7
                      </span>
                      <span className="text-[0.62rem] font-bold uppercase tracking-widest text-brand-mist/90">
                        Day
                      </span>
                    </div>
                  </div>

                  {/* Headline & Description */}
                  <div className="max-w-xl">
                    <h2 className="font-display text-3xl font-extrabold tracking-tight leading-[1.05] text-white sm:text-4xl lg:text-5xl">
                      Try it for a week. <br />
                      Keep it only{" "}
                      <span className="relative inline-block">
                        if you love it.
                        <svg
                          className="absolute -bottom-1.5 left-0 w-full overflow-visible"
                          height="8"
                          viewBox="0 0 100 8"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M1 5.5C25 2 75 2 99 5.5"
                            stroke="#c36f09"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                    </h2>
                    <p className="mt-4 text-sm leading-relaxed text-brand-mist/80 sm:text-base">
                      Every plan comes with a 7-day money-back guarantee. Generate your videos,
                      publish them, see the results for yourself. If Createtor isn't the right fit,
                      email us within 7 days and we'll refund you in full. No hoops, no hurdles, no
                      questions asked.
                    </p>
                  </div>
                </div>

                {/* Right side: Gradient bordered CTA button */}
                <div className="shrink-0">
                  {user ? (
                    <Link to="/dashboard" className="guarantee-cta-btn">
                      <span>Open Workspace</span>
                      <ArrowRight className="size-4" />
                    </Link>
                  ) : (
                    <Link to="/auth" search={{ mode: "signup" }} className="guarantee-cta-btn">
                      <span>Start Risk Free</span>
                      <ArrowRight className="size-4" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-3xl font-extrabold tabular-nums">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
    </div>
  );
}
