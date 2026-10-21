import { describe, expect, it } from "vitest";

import { isAutopilotPlan, resolveAutopilotFields } from "@/lib/autopilot.functions";

describe("isAutopilotPlan", () => {
  it("allows only Pro and Agency", () => {
    expect(isAutopilotPlan("pro")).toBe(true);
    expect(isAutopilotPlan("agency")).toBe(true);
    expect(isAutopilotPlan("free")).toBe(false);
    expect(isAutopilotPlan("creator")).toBe(false);
    expect(isAutopilotPlan("unknown")).toBe(false);
  });
});

describe("resolveAutopilotFields", () => {
  it("forces enabled off for a non-entitled plan even when the client asks for it", () => {
    const result = resolveAutopilotFields({
      plan: "free",
      enabled: true,
      videosPerWeek: 3,
      videoDurationSeconds: 45,
    });
    expect(result.entitled).toBe(false);
    expect(result.enabled).toBe(false);
  });

  it("honours enabled for an entitled plan", () => {
    const result = resolveAutopilotFields({
      plan: "pro",
      enabled: true,
      videosPerWeek: 3,
      videoDurationSeconds: 45,
    });
    expect(result.entitled).toBe(true);
    expect(result.enabled).toBe(true);
  });

  it("clamps out-of-range values from a crafted request", () => {
    const high = resolveAutopilotFields({
      plan: "agency",
      enabled: true,
      videosPerWeek: 9999,
      videoDurationSeconds: 99999,
    });
    expect(high.videosPerWeek).toBe(35);
    expect(high.videoDurationSeconds).toBe(900);

    const low = resolveAutopilotFields({
      plan: "agency",
      enabled: true,
      videosPerWeek: -5,
      videoDurationSeconds: 0,
    });
    expect(low.videosPerWeek).toBe(1);
    expect(low.videoDurationSeconds).toBe(10);
  });

  it("falls back to defaults for non-finite values", () => {
    const result = resolveAutopilotFields({
      plan: "pro",
      enabled: true,
      videosPerWeek: Number.NaN,
      videoDurationSeconds: Number.POSITIVE_INFINITY,
    });
    expect(result.videosPerWeek).toBe(3);
    expect(result.videoDurationSeconds).toBe(45);
  });
});
