import { describe, expect, it } from "vitest";

import { CREDIT_COSTS, PLANS, pricePerMonth, yearlySavings } from "@/lib/pricing";

describe("PLANS", () => {
  it("has unique keys and includes every tier", () => {
    const keys = PLANS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(keys)).toEqual(new Set(["free", "creator", "pro", "agency"]));
  });

  it("gives every plan a positive monthly credit allotment", () => {
    for (const plan of PLANS) {
      expect(plan.monthlyCredits).toBeGreaterThan(0);
    }
  });

  it("never charges more annually than twelve monthly payments", () => {
    for (const plan of PLANS) {
      expect(plan.yearlyPriceUsd).toBeLessThanOrEqual(plan.monthlyPriceUsd * 12);
    }
  });

  it("prices the free plan at zero", () => {
    const free = PLANS.find((p) => p.key === "free");
    expect(free?.monthlyPriceUsd).toBe(0);
    expect(free?.yearlyPriceUsd).toBe(0);
  });
});

describe("pricePerMonth", () => {
  const creator = PLANS.find((p) => p.key === "creator")!;

  it("returns the monthly price on a monthly cycle", () => {
    expect(pricePerMonth(creator, "monthly")).toBe(19);
  });

  it("spreads the annual lump sum across the year", () => {
    expect(pricePerMonth(creator, "yearly")).toBeCloseTo(190 / 12, 10);
  });

  it("is zero for the free plan", () => {
    const free = PLANS.find((p) => p.key === "free")!;
    expect(pricePerMonth(free, "yearly")).toBe(0);
  });
});

describe("yearlySavings", () => {
  it("is the difference between twelve monthly payments and the annual price", () => {
    const creator = PLANS.find((p) => p.key === "creator")!;
    expect(yearlySavings(creator)).toBe(19 * 12 - 190);
  });

  it("is never negative", () => {
    for (const plan of PLANS) {
      expect(yearlySavings(plan)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("CREDIT_COSTS", () => {
  it("is all positive integers", () => {
    for (const cost of Object.values(CREDIT_COSTS)) {
      expect(Number.isInteger(cost)).toBe(true);
      expect(cost).toBeGreaterThan(0);
    }
  });

  it("prices a scene video above a scene image", () => {
    expect(CREDIT_COSTS.sceneVideo).toBeGreaterThan(CREDIT_COSTS.sceneImage);
  });
});
