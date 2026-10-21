import { describe, expect, it } from "vitest";

import { RATE_LIMITS, RateLimitError } from "@/lib/rate-limit.server";

describe("RATE_LIMITS", () => {
  it("defines a positive limit and window for every bucket", () => {
    const kinds = Object.keys(RATE_LIMITS);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      const bucket = RATE_LIMITS[kind as keyof typeof RATE_LIMITS];
      expect(bucket.limit).toBeGreaterThan(0);
      expect(bucket.windowSeconds).toBeGreaterThan(0);
    }
  });

  it("limits the heaviest work (video) more tightly than text (ai)", () => {
    expect(RATE_LIMITS.video.limit).toBeLessThan(RATE_LIMITS.ai.limit);
  });
});

describe("RateLimitError", () => {
  it("carries a retry hint and is identifiable", () => {
    const error = new RateLimitError("slow down", 42);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("RateLimitError");
    expect(error.retryAfterSeconds).toBe(42);
    expect(error.message).toBe("slow down");
  });
});
