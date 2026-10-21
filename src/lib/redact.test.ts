import { describe, expect, it } from "vitest";

import { hashIp, isNetworkKey, redactMetadata, redactText, redactValue } from "@/lib/redact";

describe("hashIp", () => {
  it("returns null for empty or missing input", async () => {
    expect(await hashIp(null, "s")).toBeNull();
    expect(await hashIp(undefined, "s")).toBeNull();
    expect(await hashIp("  ", "s")).toBeNull();
  });

  it("never returns the raw IP and is stable for the same input", async () => {
    const a = await hashIp("203.0.113.7", "salt");
    const b = await hashIp("203.0.113.7", "salt");
    expect(a).toBe(b);
    expect(a).toMatch(/^ip_[0-9a-f]{16}$/);
    expect(a).not.toContain("203.0.113.7");
  });

  it("differs across salts and across IPs", async () => {
    expect(await hashIp("1.2.3.4", "a")).not.toBe(await hashIp("1.2.3.4", "b"));
    expect(await hashIp("1.2.3.4", "a")).not.toBe(await hashIp("5.6.7.8", "a"));
  });
});

describe("isNetworkKey", () => {
  it("matches common IP-ish key names", () => {
    expect(isNetworkKey("ip")).toBe(true);
    expect(isNetworkKey("user_ip")).toBe(true);
    expect(isNetworkKey("ipAddress")).toBe(true);
    expect(isNetworkKey("remote-addr")).toBe(true);
  });

  it("ignores unrelated keys", () => {
    expect(isNetworkKey("plan")).toBe(false);
    expect(isNetworkKey("shipping")).toBe(false);
  });
});

describe("redactText", () => {
  it("replaces email addresses", () => {
    expect(redactText("contact ada@example.com now")).toBe("contact [email] now");
  });

  it("replaces card-like and phone-like digit runs", () => {
    expect(redactText("card 4111 1111 1111 1111 ok")).toBe("card [redacted] ok");
    expect(redactText("call 08031234567")).toBe("call [redacted]");
  });

  it("leaves short numbers and normal words alone", () => {
    expect(redactText("plan pro, count 42, year 2026")).toBe("plan pro, count 42, year 2026");
  });
});

describe("redactValue", () => {
  it("redacts network-ish keys wholesale and emails inside other strings", () => {
    expect(
      redactValue({ ip: "203.0.113.7", note: "reach me at ada@example.com", count: 3 }),
    ).toEqual({ ip: "[ip]", note: "reach me at [email]", count: 3 });
  });

  it("recurses through arrays and nested objects", () => {
    expect(redactValue({ a: [{ ip: "1.2.3.4" }, "x@y.co"] })).toEqual({
      a: [{ ip: "[ip]" }, "[email]"],
    });
  });

  it("drops functions and undefined", () => {
    expect(redactValue({ fn: () => 1, u: undefined })).toEqual({ fn: undefined, u: undefined });
  });
});

describe("redactMetadata", () => {
  it("returns an empty object for undefined and deep-redacts otherwise", () => {
    expect(redactMetadata(undefined)).toEqual({});
    expect(redactMetadata({ clientIp: "10.0.0.1", email: "a@b.co" })).toEqual({
      clientIp: "[ip]",
      email: "[email]",
    });
  });
});
