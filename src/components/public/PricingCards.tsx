import type React from "react";

import { Link } from "@tanstack/react-router";
import {
  Bot,
  Calendar,
  FileVideo,
  Layers,
  Mic,
  Monitor,
  Pencil,
  Play,
  Repeat2,
  Rss,
  Search,
  Shield,
  Star,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PLANS as PLAN_CONFIG, type PlanKey } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/* ── Plan data ──────────────────────────────────────────────────────────── */

type FeatureItem = {
  icon: React.ElementType;
  label: string;
  /** false = this feature is NOT included (crossed out) */
  included?: boolean;
  /** highlight this row (bold, brand-colored) */
  highlight?: boolean;
  /** small badge text next to label */
  badge?: string;
};

type PlanPresentation = {
  audience: string;
  ctaLabel: string;
  featured: boolean;
  dark: boolean;
  features: FeatureItem[];
};

type PricingPlan = {
  key: PlanKey;
  name: string;
  monthlyPriceUsd: number;
  yearlyPriceUsd: number;
  yearlySavingsUsd: number;
  savePct: number;
  /** 0 renders as "unlimited" in the social row. */
  channels: number;
  /** 0 renders as "unlimited" in the social row. */
  socialAccounts: number;
  audience: string;
  ctaLabel: string;
  featured: boolean;
  dark: boolean;
  features: FeatureItem[];
};

const PRESENTATION: Record<PlanKey, PlanPresentation> = {
  free: {
    audience: "For solo starters",
    ctaLabel: "Get Started",
    featured: false,
    dark: false,
    features: [
      { icon: Zap, label: "1,000 Credits / Month", highlight: true },
      { icon: Pencil, label: "Script Generator" },
      { icon: FileVideo, label: "Up to 3 Min per Video" },
      { icon: Bot, label: "Auto Mode – 1 Series" },
      { icon: Monitor, label: "2 GB Storage" },
      { icon: Calendar, label: "Content Scheduling", included: false },
      { icon: Play, label: "Review / Auto Publish", included: false },
    ],
  },
  creator: {
    audience: "For solo creators",
    ctaLabel: "Get Access",
    featured: false,
    dark: false,
    features: [
      { icon: Zap, label: "2,000 Credits / Month", highlight: true },
      { icon: Pencil, label: "Script Generator" },
      { icon: FileVideo, label: "Up to 5 Min per Video" },
      { icon: Bot, label: "Auto Mode – 1 Series" },
      { icon: Monitor, label: "25 GB Storage" },
      { icon: Calendar, label: "Content Scheduling", included: false },
      { icon: Play, label: "Review / Auto Publish", included: false },
    ],
  },
  pro: {
    audience: "Most Popular",
    ctaLabel: "Get Access",
    featured: true,
    dark: false,
    features: [
      { icon: Zap, label: "8,000 Credits / Month", highlight: true },
      { icon: Pencil, label: "Script Generator" },
      { icon: FileVideo, label: "Up to 15 Min per Video" },
      { icon: Bot, label: "Auto Mode – 2 Series" },
      { icon: Monitor, label: "100 GB Storage" },
      { icon: Mic, label: "AI Voiceover", badge: "NEW" },
      { icon: Rss, label: "Captions & Music" },
      { icon: Search, label: "Niche Monitoring" },
      { icon: TrendingUp, label: "Advanced Analytics" },
      { icon: Calendar, label: "Content Scheduling" },
      { icon: Repeat2, label: "Repurposing Engine" },
      { icon: Play, label: "Review / Auto Publish" },
    ],
  },
  agency: {
    audience: "For Agencies",
    ctaLabel: "Get Access",
    featured: false,
    dark: true,
    features: [
      { icon: Zap, label: "30,000 Credits / Month", highlight: true },
      { icon: Pencil, label: "Script Generator" },
      { icon: FileVideo, label: "Up to 15 Min per Video" },
      { icon: Bot, label: "Auto Mode – 3 Series" },
      { icon: Monitor, label: "500 GB Storage" },
      { icon: Mic, label: "AI Voiceover", badge: "NEW" },
      { icon: Rss, label: "Captions & Music" },
      { icon: Search, label: "Niche Monitoring" },
      { icon: TrendingUp, label: "Advanced Analytics" },
      { icon: Calendar, label: "Content Scheduling" },
      { icon: Layers, label: "Batch Processing & Automation" },
      { icon: Repeat2, label: "Repurposing Engine" },
      { icon: Play, label: "Review / Auto Publish" },
      { icon: Users, label: "Team Seats (up to 15)" },
      { icon: Shield, label: "White-Label Options" },
      { icon: Star, label: "Priority Support" },
    ],
  },
};

/**
 * All numbers come from @/lib/pricing — the same config that drives billing and
 * credit grants — so these marketing cards can never drift from what the product
 * actually charges. Only the presentation (copy, icons, ordering) lives here.
 */
const PLANS: PricingPlan[] = PLAN_CONFIG.map((plan) => {
  const annualIfMonthly = plan.monthlyPriceUsd * 12;
  const yearlySavingsUsd = Math.max(0, annualIfMonthly - plan.yearlyPriceUsd);
  const savePct = annualIfMonthly > 0 ? Math.round((yearlySavingsUsd / annualIfMonthly) * 100) : 0;
  const presentation = PRESENTATION[plan.key];

  return {
    key: plan.key,
    name: plan.name,
    monthlyPriceUsd: plan.monthlyPriceUsd,
    yearlyPriceUsd: plan.yearlyPriceUsd,
    yearlySavingsUsd,
    savePct,
    channels: plan.channels === "unlimited" ? 0 : plan.channels,
    socialAccounts: plan.socialAccounts === "unlimited" ? 0 : plan.socialAccounts,
    audience: presentation.audience,
    ctaLabel: presentation.ctaLabel,
    featured: presentation.featured,
    dark: presentation.dark,
    features: presentation.features,
  };
});

/* ── Social icon row ────────────────────────────────────────────────────── */

const SOCIAL_ICONS = [
  {
    id: "youtube",
    color: "#FF0000",
    d: "M21.58 7.19a2.74 2.74 0 00-1.93-1.94C18 5 12 5 12 5s-6 0-7.65.25A2.74 2.74 0 002.42 7.19 28.58 28.58 0 002 12a28.58 28.58 0 00.42 4.81 2.74 2.74 0 001.93 1.94C6 19 12 19 12 19s6 0 7.65-.25a2.74 2.74 0 001.93-1.94A28.58 28.58 0 0022 12a28.58 28.58 0 00-.42-4.81zM10 15V9l5 3-5 3z",
  },
  {
    id: "tiktok",
    color: "#000000",
    d: "M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.29 6.29 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9a8.27 8.27 0 004.84 1.55V7.12a4.85 4.85 0 01-1.07-.43z",
  },
  {
    id: "instagram",
    color: "#E1306C",
    d: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z",
  },
  {
    id: "facebook",
    color: "#1877F2",
    d: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  },
  {
    id: "pinterest",
    color: "#E60023",
    d: "M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z",
  },
];

function SocialRow({
  channels,
  socialAccounts,
  dark,
}: {
  channels: number;
  socialAccounts: number;
  dark?: boolean;
}) {
  const isUnlimited = channels === 0;
  const iconBg = dark ? "bg-white/10 hover:bg-white/20" : "bg-muted/70 hover:bg-muted";
  const countText = dark ? "text-white/70" : "text-muted-foreground";

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 flex-wrap">
        {SOCIAL_ICONS.map((icon) => (
          <div
            key={icon.id}
            title={icon.id}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
              iconBg,
            )}
          >
            <svg viewBox="0 0 24 24" fill={icon.color} className="h-3.5 w-3.5" aria-hidden="true">
              <path d={icon.d} />
            </svg>
          </div>
        ))}
        <span
          className={cn(
            "ml-1 rounded-full border px-2 py-0.5 text-xs font-bold",
            dark ? "border-white/20 text-white" : "border-border text-foreground",
          )}
        >
          ×{isUnlimited ? "∞" : socialAccounts}
        </span>
      </div>
      <p className={cn("mt-1.5 text-xs", countText)}>
        {isUnlimited
          ? "Unlimited channels · unlimited social accounts"
          : `${channels} channel${channels > 1 ? "s" : ""} · up to ${socialAccounts} social accounts`}
      </p>
    </div>
  );
}

/* ── Feature list ───────────────────────────────────────────────────────── */

function FeatureRow({ item, dark }: { item: FeatureItem; dark?: boolean }) {
  const included = item.included !== false;
  const Icon = item.icon;

  return (
    <li
      className={cn(
        "flex items-center gap-2.5 text-sm",
        !included && "opacity-40",
        item.highlight
          ? dark
            ? "font-semibold text-brand-tertiary"
            : "font-semibold text-primary"
          : dark
            ? "text-white/80"
            : "text-muted-foreground",
      )}
    >
      {included ? (
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            item.highlight
              ? dark
                ? "text-brand-tertiary"
                : "text-primary"
              : dark
                ? "text-white/75"
                : "text-muted-foreground",
          )}
        />
      ) : (
        <X className="size-3.5 shrink-0 text-current" />
      )}
      <span>{item.label}</span>
      {item.badge && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            dark ? "bg-brand-tertiary/20 text-brand-tertiary" : "bg-primary/10 text-primary",
          )}
        >
          {item.badge}
        </span>
      )}
    </li>
  );
}

/* ── Single card ────────────────────────────────────────────────────────── */

function PlanCard({ plan }: { plan: PricingPlan }) {
  const isFree = plan.monthlyPriceUsd === 0;

  return (
    <article
      className={cn(
        "pricing-card",
        plan.featured && "pricing-card--featured",
        plan.dark && "pricing-card--dark",
      )}
    >
      {/* Audience label */}
      <p className={cn("pricing-audience", plan.dark ? "text-brand-tertiary" : "text-primary")}>
        {plan.audience}
      </p>

      {/* Plan name + discount badge */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <h2
          className={cn(
            "font-display text-2xl font-bold",
            plan.dark ? "text-white" : "text-foreground",
          )}
        >
          {plan.name}
        </h2>
        <span
          className={cn(
            "pricing-badge",
            plan.featured
              ? "bg-primary text-primary-foreground"
              : plan.dark
                ? "bg-brand-tertiary/20 text-brand-tertiary"
                : "bg-primary/10 text-primary",
          )}
        >
          {isFree ? "Free" : `Save ${plan.savePct}%`}
        </span>
      </div>

      {/* Price */}
      <div className="mt-4">
        <p
          className={cn(
            "font-display font-bold leading-none",
            plan.dark ? "text-white" : "text-foreground",
          )}
        >
          <span className="text-4xl">${plan.monthlyPriceUsd}</span>
          <span
            className={cn(
              "ml-1 text-sm font-medium",
              plan.dark ? "text-brand-tertiary" : "text-primary",
            )}
          >
            {isFree ? "/forever" : "/month"}
          </span>
        </p>
        {!isFree && (
          <p className={cn("mt-2 text-xs", plan.dark ? "text-white/80" : "text-muted-foreground")}>
            or ${plan.yearlyPriceUsd}/year · save ${plan.yearlySavingsUsd}
          </p>
        )}
      </div>

      {/* CTA */}
      <Button
        asChild
        className={cn(
          "mt-5 w-full font-semibold",
          plan.featured
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90"
            : plan.dark
              ? "border border-brand-secondary/40 bg-transparent text-white hover:bg-white/10"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        )}
        variant="ghost"
      >
        <Link to="/auth" search={{ mode: "signup" }}>
          {plan.ctaLabel}
        </Link>
      </Button>

      {/* Note */}
      <p
        className={cn(
          "mt-2 text-center text-xs",
          plan.dark ? "text-white/75" : "text-muted-foreground",
        )}
      >
        {isFree
          ? "No credit card required"
          : `Auto-renews monthly at $${plan.monthlyPriceUsd} until cancelled · cancel anytime`}
      </p>

      {/* Social row */}
      <SocialRow channels={plan.channels} socialAccounts={plan.socialAccounts} dark={!!plan.dark} />

      {/* Divider */}
      <div
        className={cn("mt-5 mb-4 border-t", plan.dark ? "border-white/10" : "border-border/60")}
      />

      {/* Feature label */}
      <p
        className={cn(
          "mb-3 text-[11px] font-bold uppercase tracking-widest",
          plan.dark ? "text-white/75" : "text-muted-foreground",
        )}
      >
        What you get
      </p>

      {/* Feature list */}
      <ul className="space-y-2.5">
        {plan.features.map((f) => (
          <FeatureRow key={f.label} item={f} dark={!!plan.dark} />
        ))}
      </ul>
    </article>
  );
}

/* ── Public export ──────────────────────────────────────────────────────── */

export function PricingCards({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-start", className)}>
      {PLANS.map((plan) => (
        <PlanCard key={plan.key} plan={plan} />
      ))}
    </div>
  );
}

// Keep legacy export so billing toggle references still compile if needed
export { type PricingPlan };
