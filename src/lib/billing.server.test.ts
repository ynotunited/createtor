import { describe, expect, it } from "vitest";

import { cycleAmountUsd, cycleCredits, getPlan } from "@/lib/billing.server";
import type { PlanKey } from "@/lib/pricing";

describe("getPlan", () => {
  it("returns the plan for a known key", () => {
    expect(getPlan("creator").monthlyCredits).toBe(2000);
  });

  it("throws for an unknown key", () => {
    expect(() => getPlan("enterprise" as PlanKey)).toThrow(/Unknown plan/);
  });
});

describe("cycleAmountUsd", () => {
  it("charges the monthly price for a monthly cycle", () => {
    expect(cycleAmountUsd("creator", "monthly")).toBe(19);
    expect(cycleAmountUsd("agency", "monthly")).toBe(149);
  });

  it("charges the annual lump sum for a yearly cycle", () => {
    expect(cycleAmountUsd("creator", "yearly")).toBe(190);
    expect(cycleAmountUsd("agency", "yearly")).toBe(1490);
  });

  it("is free for the free plan", () => {
    expect(cycleAmountUsd("free", "monthly")).toBe(0);
    expect(cycleAmountUsd("free", "yearly")).toBe(0);
  });
});

describe("cycleCredits", () => {
  it("grants one month of credits for a monthly cycle", () => {
    expect(cycleCredits("creator", "monthly")).toBe(2000);
    expect(cycleCredits("free", "monthly")).toBe(1000);
  });

  it("grants a full year of credits for a yearly cycle", () => {
    expect(cycleCredits("creator", "yearly")).toBe(24000);
    expect(cycleCredits("pro", "yearly")).toBe(96000);
    expect(cycleCredits("free", "yearly")).toBe(12000);
  });
});
