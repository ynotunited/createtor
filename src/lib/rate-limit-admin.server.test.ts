import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/lib/rate-limit-core.server", () => ({ consumeRateLimit: mocks.consume }));
vi.mock("@/lib/security-events.server", () => ({ recordSecurityEvent: mocks.record }));

import { ADMIN_RATE_LIMITS, RateLimitError, enforceAdminRateLimit } from "@/lib/rate-limit.server";

beforeEach(() => {
  mocks.consume.mockReset().mockResolvedValue("allowed");
  mocks.record.mockReset().mockResolvedValue(undefined);
});

describe("ADMIN_RATE_LIMITS", () => {
  it("keeps every admin bucket bounded", () => {
    for (const bucket of Object.values(ADMIN_RATE_LIMITS)) {
      expect(bucket.limit).toBeGreaterThan(0);
      expect(bucket.windowSeconds).toBeGreaterThan(0);
    }
  });

  it("limits the privilege-escalation path far tighter than routine actions", () => {
    expect(ADMIN_RATE_LIMITS.adminClaim.limit).toBeLessThan(ADMIN_RATE_LIMITS.adminAction.limit);
  });
});

describe("enforceAdminRateLimit", () => {
  it("allows and keys the counter by kind + a pseudonymised subject (never the raw IP)", async () => {
    await expect(enforceAdminRateLimit("adminClaim", "1.2.3.4")).resolves.toBeUndefined();
    const key = mocks.consume.mock.calls[0]?.[0] as string;
    expect(key).toMatch(/^admin\.adminClaim:ip_[0-9a-f]{16}$/);
    expect(key).not.toContain("1.2.3.4");
    expect(mocks.consume).toHaveBeenCalledWith(
      key,
      ADMIN_RATE_LIMITS.adminClaim.limit,
      ADMIN_RATE_LIMITS.adminClaim.windowSeconds,
    );
  });

  it("passes a non-IP subject (user id) through unchanged", async () => {
    const userId = "11111111-2222-3333-4444-555555555555";
    await enforceAdminRateLimit("adminAction", userId);
    expect(mocks.consume).toHaveBeenCalledWith(
      `admin.adminAction:${userId}`,
      ADMIN_RATE_LIMITS.adminAction.limit,
      ADMIN_RATE_LIMITS.adminAction.windowSeconds,
    );
  });

  it("throws on a denial and records a security event", async () => {
    mocks.consume.mockResolvedValue("denied");
    await expect(enforceAdminRateLimit("adminClaim", "1.2.3.4")).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(mocks.record.mock.calls[0]?.[0]).toBe("rate_limited");
    expect(mocks.record.mock.calls[0]?.[1]).toMatchObject({ failClosed: true });
    // The recorded subject is the pseudonym, not the raw address.
    expect((mocks.record.mock.calls[0]?.[1] as { subject: string }).subject).toMatch(/^ip_/);
  });

  it("fails closed when the limiter errors", async () => {
    mocks.consume.mockResolvedValue("error");
    await expect(enforceAdminRateLimit("adminClaim", "1.2.3.4")).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(mocks.record.mock.calls[0]?.[1]).toMatchObject({
      failClosed: true,
      reason: "limiter_unavailable",
    });
  });
});
