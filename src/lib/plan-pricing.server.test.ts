import { describe, expect, it } from "vitest";

import { defaultPlanPricing } from "@/lib/platform-config.server";
import { PLANS } from "@/lib/pricing";

describe("defaultPlanPricing", () => {
  it("derives amounts from PLANS as fallbacks until configured", () => {
    const pricing = defaultPlanPricing();
    for (const plan of PLANS) {
      expect(pricing[plan.key].monthly.amountCents).toBe(Math.round(plan.monthlyPriceUsd * 100));
      expect(pricing[plan.key].yearly.amountCents).toBe(Math.round(plan.yearlyPriceUsd * 100));
    }
  });

  it("starts with no provider ids so checkout is disabled until set", () => {
    const pricing = defaultPlanPricing();
    for (const plan of PLANS) {
      expect(pricing[plan.key].monthly.stripePriceId).toBe("");
      expect(pricing[plan.key].monthly.paypalPlanId).toBe("");
    }
  });

  it("marks the free plan as zero-cost", () => {
    const pricing = defaultPlanPricing();
    expect(pricing.free.monthly.amountCents).toBe(0);
    expect(pricing.free.yearly.amountCents).toBe(0);
  });
});
