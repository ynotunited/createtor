/**
 * Plan catalogue and credit configuration.
 *
 * The price fields here are *defaults* only. The source of truth for what a
 * customer is charged is the `pricing` row in `system_settings` (admin-editable
 * in Settings → Plan pricing), resolved server-side by
 * `platform-config.server.ts`. Checkout uses the configured Stripe price id and
 * the configured amount, never these defaults, once they are set.
 */
export type PlanKey = "free" | "creator" | "pro" | "agency";

export type BillingCycle = "monthly" | "yearly";

export type Plan = {
  key: PlanKey;
  name: string;
  monthlyPriceUsd: number;
  /** Total charged per year when billed annually (0 for the free plan). */
  yearlyPriceUsd: number;
  stripePriceId: string | null;
  stripeYearlyPriceId: string | null;
  tagline: string;
  monthlyCredits: number;
  storageGb: number;
  channels: number | "unlimited";
  socialAccounts: number | "unlimited";
  watermark: boolean;
  autopilot: boolean;
  advancedAnalytics: boolean;
  teamMembers: number;
  whiteLabel: boolean;
  features: string[];
};

export const FREE_PLAN_MONTHLY_CREDITS = 1000;

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
    stripePriceId: null,
    stripeYearlyPriceId: null,
    tagline: "Start now. 1,000 credits on the house, every month.",
    monthlyCredits: FREE_PLAN_MONTHLY_CREDITS,
    storageGb: 2,
    channels: 1,
    socialAccounts: 1,
    watermark: true,
    autopilot: false,
    advancedAnalytics: false,
    teamMembers: 1,
    whiteLabel: false,
    features: [
      "1,000 free credits every month",
      "1 channel",
      "Core studio tools",
      "Watermark on exports",
    ],
  },
  {
    key: "creator",
    name: "Creator",
    monthlyPriceUsd: 19,
    yearlyPriceUsd: 190,
    stripePriceId: null,
    stripeYearlyPriceId: null,
    tagline: "For solo creators publishing consistently.",
    monthlyCredits: 2000,
    storageGb: 25,
    channels: 3,
    socialAccounts: 3,
    watermark: false,
    autopilot: false,
    advancedAnalytics: false,
    teamMembers: 1,
    whiteLabel: false,
    features: ["No watermark", "Multiple channels", "Voice library", "Captions & music"],
  },
  {
    key: "pro",
    name: "Pro",
    monthlyPriceUsd: 49,
    yearlyPriceUsd: 490,
    stripePriceId: null,
    stripeYearlyPriceId: null,
    tagline: "Daily queue and analytics for serious output.",
    monthlyCredits: 8000,
    storageGb: 100,
    channels: 10,
    socialAccounts: 10,
    watermark: false,
    autopilot: true,
    advancedAnalytics: true,
    teamMembers: 3,
    whiteLabel: false,
    features: ["Daily queue", "Advanced analytics", "Learning loop", "Repurposing engine"],
  },
  {
    key: "agency",
    name: "Agency",
    monthlyPriceUsd: 149,
    yearlyPriceUsd: 1490,
    stripePriceId: null,
    stripeYearlyPriceId: null,
    tagline: "Multiple client workspaces and a team.",
    monthlyCredits: 30000,
    storageGb: 500,
    channels: "unlimited",
    socialAccounts: "unlimited",
    watermark: false,
    autopilot: true,
    advancedAnalytics: true,
    teamMembers: 15,
    whiteLabel: true,
    features: ["Client workspaces", "Team seats", "White-label options", "Priority rendering"],
  },
];

/** Effective per-month price for a billing cycle (yearly is billed as a lump sum). */
export function pricePerMonth(plan: Plan, cycle: BillingCycle): number {
  if (plan.monthlyPriceUsd === 0) return 0;
  return cycle === "yearly" ? plan.yearlyPriceUsd / 12 : plan.monthlyPriceUsd;
}

/** Dollars saved per year by paying annually instead of monthly. */
export function yearlySavings(plan: Plan): number {
  return Math.max(0, plan.monthlyPriceUsd * 12 - plan.yearlyPriceUsd);
}

/** Estimated credit cost per generation unit, shown before execution. */
export const CREDIT_COSTS = {
  ideaBatch: 2,
  scriptGenerate: 6,
  scriptRewrite: 4,
  storyboard: 8,
  sceneImage: 5,
  sceneVideo: 30,
  voiceoverPerMinute: 12,
  transcription: 3,
  renderPerMinute: 20,
  repurposeClip: 10,
} as const;

export type CreditCostKey = keyof typeof CREDIT_COSTS;
