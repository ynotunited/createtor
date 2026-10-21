import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/lib/rate-limit-core.server", () => ({ consumeRateLimit: mocks.consume }));
vi.mock("@/lib/security-events.server", () => ({ recordSecurityEvent: mocks.record }));

import { ABUSE_LIMITS, abuseScopeFor, checkAbuseLimit, clientIp } from "@/lib/abuse.server";

beforeEach(() => {
  mocks.consume.mockReset().mockResolvedValue("allowed");
  mocks.record.mockReset().mockResolvedValue(undefined);
});

describe("abuseScopeFor", () => {
  it("buckets server functions regardless of path", () => {
    expect(abuseScopeFor("serverFn", "/_server")).toBe("serverFn");
  });

  it("buckets API routes but exempts webhooks and health", () => {
    expect(abuseScopeFor("router", "/api/generate-image")).toBe("api");
    expect(abuseScopeFor("router", "/api/v1/generate-image")).toBe("api");
    expect(abuseScopeFor("router", "/api/payments/stripe")).toBeNull();
    expect(abuseScopeFor("router", "/api/payments/paypal")).toBeNull();
    expect(abuseScopeFor("router", "/api/health")).toBeNull();
    expect(abuseScopeFor("router", "/api/v1/health")).toBeNull();
  });

  it("buckets ordinary page requests", () => {
    expect(abuseScopeFor("router", "/dashboard")).toBe("page");
    expect(abuseScopeFor("router", "/")).toBe("page");
  });
});

describe("checkAbuseLimit", () => {
  it("allows and keys the window by a hashed IP when the limiter permits", async () => {
    const decision = await checkAbuseLimit("api", "1.2.3.4");
    expect(decision).toEqual({ allowed: true });
    const key = mocks.consume.mock.calls[0]?.[0] as string;
    expect(key).toMatch(/^abuse:api:ip_[0-9a-f]{16}$/);
    expect(key).not.toContain("1.2.3.4");
    expect(mocks.consume).toHaveBeenCalledWith(key, 120, 60);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("fails open when the limiter errors", async () => {
    mocks.consume.mockResolvedValue("error");
    await expect(checkAbuseLimit("page", "1.2.3.4")).resolves.toEqual({ allowed: true });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("denies, records a security event and reports a retry window", async () => {
    mocks.consume.mockResolvedValue("denied");
    const decision = await checkAbuseLimit("serverFn", "9.9.9.9");

    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.record.mock.calls[0]?.[0]).toBe("rate_limited");
    expect(mocks.record.mock.calls[0]?.[1]).toMatchObject({ scope: "serverFn", ip: "9.9.9.9" });
  });

  it("degrades missing IPs to a shared bucket", async () => {
    mocks.consume.mockResolvedValue("denied");
    await checkAbuseLimit("api", null);
    expect(mocks.consume).toHaveBeenCalledWith("abuse:api:unknown", 120, 60);
  });

  it("keeps every configured bucket bounded", () => {
    for (const bucket of Object.values(ABUSE_LIMITS)) {
      expect(bucket.limit).toBeGreaterThan(0);
      expect(bucket.windowSeconds).toBeGreaterThan(0);
    }
  });
});

describe("clientIp", () => {
  it("reads the forwarded client address", () => {
    const request = new Request("https://x.test/", {
      headers: { "cf-connecting-ip": "203.0.113.7" },
    });
    expect(clientIp(request)).toBe("203.0.113.7");
  });
});
