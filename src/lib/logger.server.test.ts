import { describe, expect, it } from "vitest";

import { clientIpFromHeaders, log, logSecurity, userAgentFromHeaders } from "@/lib/logger.server";

describe("clientIpFromHeaders", () => {
  it("prefers the Cloudflare client IP", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": "10.0.0.1, 203.0.113.9",
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.9");
  });

  it("falls back to the first x-forwarded-for hop", () => {
    const headers = new Headers({ "x-forwarded-for": " 10.0.0.5 , 10.0.0.6 " });
    expect(clientIpFromHeaders(headers)).toBe("10.0.0.5");
  });

  it("returns null when no forwarding headers exist", () => {
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});

describe("userAgentFromHeaders", () => {
  it("truncates long user agents to keep logs bounded", () => {
    const headers = new Headers({ "user-agent": "a".repeat(500) });
    expect(userAgentFromHeaders(headers)).toHaveLength(200);
  });

  it("returns null when absent", () => {
    expect(userAgentFromHeaders(new Headers())).toBeNull();
  });
});

describe("log", () => {
  it("emits without throwing, including circular fields", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(() => log("info", "test.event", { circular })).not.toThrow();
    expect(() => log("error", "test.error", { detail: new Error("boom") })).not.toThrow();
  });

  it("labels security events as warnings with a security prefix", () => {
    expect(() => logSecurity("rate_limited", { bucket: "ai" })).not.toThrow();
  });
});
