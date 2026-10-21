import { describe, expect, it } from "vitest";

import { assertSafeUpstreamBaseUrl } from "@/lib/ssrf-guard";

describe("assertSafeUpstreamBaseUrl", () => {
  it("accepts a public https gateway", () => {
    expect(assertSafeUpstreamBaseUrl("https://api.openai.com/v1").hostname).toBe("api.openai.com");
    expect(assertSafeUpstreamBaseUrl("https://generativelanguage.googleapis.com").protocol).toBe(
      "https:",
    );
  });

  it("rejects non-https schemes", () => {
    expect(() => assertSafeUpstreamBaseUrl("http://api.openai.com")).toThrow(/https/);
    expect(() => assertSafeUpstreamBaseUrl("ftp://api.openai.com")).toThrow(/https/);
    expect(() => assertSafeUpstreamBaseUrl("file:///etc/passwd")).toThrow(/https/);
  });

  it("rejects localhost and blocked suffixes", () => {
    expect(() => assertSafeUpstreamBaseUrl("https://localhost:8080")).toThrow(/local or private/);
    expect(() => assertSafeUpstreamBaseUrl("https://api.local")).toThrow(/local or private/);
    expect(() => assertSafeUpstreamBaseUrl("https://thing.internal")).toThrow(/local or private/);
  });

  it("rejects private and loopback IPv4 literals", () => {
    for (const host of [
      "https://127.0.0.1",
      "https://10.0.0.5",
      "https://192.168.1.1",
      "https://172.16.0.1",
      "https://172.31.255.255",
      "https://169.254.169.254",
      "https://0.0.0.0",
      "https://100.64.0.1",
    ]) {
      expect(() => assertSafeUpstreamBaseUrl(host)).toThrow(/private or loopback/);
    }
  });

  it("allows public IPv4 literals outside private ranges", () => {
    expect(assertSafeUpstreamBaseUrl("https://8.8.8.8").hostname).toBe("8.8.8.8");
    expect(assertSafeUpstreamBaseUrl("https://172.32.0.1").hostname).toBe("172.32.0.1");
  });

  it("rejects private and loopback IPv6 literals", () => {
    for (const host of [
      "https://[::1]",
      "https://[fe80::1]",
      "https://[fc00::1]",
      "https://[fd12:3456::1]",
      "https://[::ffff:127.0.0.1]",
    ]) {
      expect(() => assertSafeUpstreamBaseUrl(host)).toThrow(/private or loopback/);
    }
  });

  it("rejects a malformed URL", () => {
    expect(() => assertSafeUpstreamBaseUrl("not a url")).toThrow(/valid URL/);
  });
});
