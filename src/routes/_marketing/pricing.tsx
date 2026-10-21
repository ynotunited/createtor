import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { PricingCards } from "@/components/public/PricingCards";
import { CREDIT_COSTS, PLANS } from "@/lib/pricing";

export const Route = createFileRoute("/_marketing/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing - Createtor" },
      {
        name: "description",
        content:
          "Start free with 1,000 credits every month, then scale to Creator $19/mo, Pro $49/mo or Agency $149/mo. Save two months with yearly billing.",
      },
      { property: "og:title", content: "Pricing | Createtor" },
      {
        property: "og:description",
        content:
          "Free plan with 1,000 monthly credits, paid plans from $19/mo, and a yearly option that saves two months. Credit costs are shown before every generation.",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Createtor",
          description:
            "Automated faceless video creation, scheduling and publishing for creator channels.",
          url: "https://createtor.xyz/pricing",
          offers: PLANS.map((plan) => ({
            "@type": "Offer",
            name: `${plan.name} plan`,
            price: plan.monthlyPriceUsd,
            priceCurrency: "USD",
            url: "https://createtor.xyz/pricing",
            availability: "https://schema.org/InStock",
          })),
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }),
      },
    ],
  }),
  component: PricingPage,
});

const COMPARISON: { label: string; values: (string | number | boolean)[] }[] = [
  {
    label: "Price / month",
    values: PLANS.map((p) => (p.monthlyPriceUsd === 0 ? "Free" : `$${p.monthlyPriceUsd}`)),
  },
  {
    label: "Price / year",
    values: PLANS.map((p) => (p.yearlyPriceUsd === 0 ? "Free" : `$${p.yearlyPriceUsd}`)),
  },
  { label: "Credits / month", values: PLANS.map((p) => p.monthlyCredits.toLocaleString()) },
  {
    label: "Channels",
    values: PLANS.map((p) => (p.channels === "unlimited" ? "Unlimited" : p.channels)),
  },
  { label: "Users", values: PLANS.map((p) => p.teamMembers) },
  { label: "Storage", values: PLANS.map((p) => `${p.storageGb} GB`) },
  { label: "No watermark", values: PLANS.map((p) => !p.watermark) },
  { label: "Autopilot daily queue", values: PLANS.map((p) => p.autopilot) },
  { label: "Advanced analytics", values: PLANS.map((p) => p.advancedAnalytics) },
  { label: "White label", values: PLANS.map((p) => p.whiteLabel) },
];

const CREDIT_ROWS = Object.entries(CREDIT_COSTS) as [keyof typeof CREDIT_COSTS, number][];

const FAQ = [
  {
    q: "What happens when I run out of credits?",
    a: "A generation is blocked when the workspace does not have enough credits for it. Credits are reserved before a run and refunded in full if the run fails, so limits are enforced before anything executes.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. Plans are workspaces-level, so you move up or down whenever your queue changes. Credits, channels and storage adjust with the switch.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. The Free plan gives you 1,000 credits every month, at no cost and with no card. It is enough to produce a handful of videos a month with a watermark; paid plans remove the watermark and add more credits, channels and storage.",
  },
  {
    q: "How does yearly billing work?",
    a: "Switch the toggle to yearly and you pay once for twelve months. Yearly works out to two months free, and the per-month equivalent is shown next to the annual total.",
  },
  {
    q: "Why do you show credit costs everywhere?",
    a: "Because the product should be honest about limits before any generation runs. Every action shows its estimated cost next to it, and your balance is checked first.",
  },
];

function PricingPage() {
  return (
    <div>
      <section className="hero-glow relative border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
          <div className="max-w-3xl">
            <p className="eyebrow">Pricing</p>
            <h1 className="mt-5 font-display text-5xl font-extrabold tracking-tight leading-[0.88] sm:text-6xl">
              Simple, transparent pricing.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Start free with 1,000 credits every month, no card required. Upgrade when the queue is
              working, and save two months with yearly billing. Every action shows its credit cost
              before it runs.
            </p>
          </div>

          <PricingCards className="mt-14" />
        </div>
      </section>

      <section className="section-band">
        <div className="mx-auto max-w-7xl px-5">
          <div className="section-heading">
            <p className="eyebrow">Compare</p>
            <h2>Every plan, side by side.</h2>
          </div>
          <div className="glass-panel mt-12 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">Plan comparison</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Feature
                  </th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.key}
                      scope="col"
                      className="px-5 py-4 text-center font-display text-base font-semibold"
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-0">
                    <td className="px-5 py-3.5 text-muted-foreground">{row.label}</td>
                    {row.values.map((value, i) => (
                      <td key={i} className="px-5 py-3.5 text-center">
                        {typeof value === "boolean" ? (
                          value ? (
                            <Check className="mx-auto size-4 text-primary" />
                          ) : (
                            <span className="text-muted-foreground">
                              <span className="sr-only">Not included</span>
                              <span aria-hidden="true">—</span>
                            </span>
                          )
                        ) : (
                          <span className="font-medium">{value}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section-band border-t border-border">
        <div className="mx-auto max-w-7xl px-5">
          <div className="section-heading">
            <p className="eyebrow">Where credits go</p>
            <h2>Costs are published before you run anything.</h2>
            <p>
              This is the full estimate table the app uses. You see these figures next to every
              action in the studio, and your balance is checked before a run starts.
            </p>
          </div>
          <div className="glass-panel mt-12 overflow-x-auto rounded-2xl">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Estimated credit costs per action</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Action
                  </th>
                  <th scope="col" className="px-5 py-4 text-right font-semibold">
                    Estimated credits
                  </th>
                </tr>
              </thead>
              <tbody>
                {CREDIT_ROWS.map(([key, cost]) => (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 text-muted-foreground">
                      {key
                        .replace(/([a-z])([A-Z])/g, "$1 $2")
                        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
                        .replace(/^\w/, (c) => c.toUpperCase())}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            Anything you generate can be re-run after edits — same transparent costing, reserved up
            front every time.
          </p>
        </div>
      </section>

      <section className="section-band border-t border-border">
        <div className="mx-auto max-w-7xl px-5">
          <div className="section-heading">
            <p className="eyebrow">Questions</p>
            <h2>Pricing, answered plainly.</h2>
          </div>
          <div className="question-list mt-12 max-w-3xl">
            {FAQ.map((item) => (
              <article key={item.q}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
