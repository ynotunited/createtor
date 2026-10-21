import { describe, expect, it } from "vitest";

import { buildCsp, cspHeaderName, routeAllowsTurnstile } from "@/lib/csp.server";

const SUPABASE = "https://abcdefghijklmnop.supabase.co";

describe("routeAllowsTurnstile", () => {
  it("allows the widget only on /auth", () => {
    expect(routeAllowsTurnstile("/auth")).toBe(true);
    expect(routeAllowsTurnstile("/auth/")).toBe(true);
  });

  it("denies every other route, including sensitive ones", () => {
    for (const path of ["/", "/dashboard", "/billing", "/settings", "/admin", "/auth/reset"]) {
      expect(routeAllowsTurnstile(path)).toBe(false);
    }
  });
});

describe("buildCsp", () => {
  const env = { VITE_SUPABASE_URL: SUPABASE };

  it("is same-origin by default", () => {
    const csp = buildCsp({ pathname: "/dashboard", env });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("does NOT allow the Turnstile script or frame on sensitive routes", () => {
    for (const path of ["/billing", "/settings", "/dashboard"]) {
      const csp = buildCsp({ pathname: path, env });
      expect(csp).toContain("script-src 'self';");
      expect(csp).toContain("frame-src 'self';");
    }
  });

  it("allows the Turnstile script and frame only on /auth", () => {
    const csp = buildCsp({ pathname: "/auth", env });
    expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(csp).toContain("frame-src 'self' https://challenges.cloudflare.com");
  });

  it("always allows the Turnstile connect endpoint (challenge subrequests)", () => {
    expect(buildCsp({ pathname: "/dashboard", env })).toContain(
      "connect-src 'self' https://challenges.cloudflare.com",
    );
  });

  it("includes the Supabase origin in connect/img/media when configured", () => {
    const csp = buildCsp({ pathname: "/dashboard", env });
    expect(csp).toContain("connect-src 'self' https://challenges.cloudflare.com " + SUPABASE);
    expect(csp).toContain("img-src 'self' data: blob: " + SUPABASE);
  });

  it("omits Supabase when no URL is configured", () => {
    const csp = buildCsp({ pathname: "/", env: {} });
    expect(csp).not.toContain("supabase.co");
    expect(csp).toContain("default-src 'self'");
  });

  it("restricts frame-ancestors to same-origin", () => {
    expect(buildCsp({ pathname: "/", env })).toContain("frame-ancestors 'self'");
    expect(buildCsp({ pathname: "/", env })).not.toContain("lovable");
  });

  it("registers the report endpoint", () => {
    expect(buildCsp({ pathname: "/", env })).toContain("report-uri /api/csp-report");
  });
});

describe("cspHeaderName", () => {
  it("is report-only until enforced", () => {
    expect(cspHeaderName({})).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName({ CSP_ENFORCE: "false" })).toBe("Content-Security-Policy-Report-Only");
  });

  it("enforces when the flag is set", () => {
    expect(cspHeaderName({ CSP_ENFORCE: "true" })).toBe("Content-Security-Policy");
    expect(cspHeaderName({ CSP_ENFORCE: "1" })).toBe("Content-Security-Policy");
  });
});
