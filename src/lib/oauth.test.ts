import { describe, expect, it } from "vitest";

import {
  googleOAuthOptions,
  OAUTH_SCOPES,
  OAUTH_SCOPE_STRING,
  resolveOAuthRedirect,
} from "@/lib/oauth";

describe("OAuth scopes", () => {
  it("requests only identity scopes", () => {
    expect([...OAUTH_SCOPES].sort()).toEqual(["email", "openid", "profile"]);
  });

  it("never requests broad Google scopes", () => {
    const forbidden = ["drive", "calendar", "contacts", "gmail", "spreadsheets"];
    for (const scope of forbidden) {
      expect(OAUTH_SCOPE_STRING).not.toContain(scope);
    }
  });
});

describe("resolveOAuthRedirect", () => {
  it("prefers the configured URL (exact allowlist target)", () => {
    expect(
      resolveOAuthRedirect({
        configuredUrl: "https://app.example/auth",
        origin: "http://localhost:8080",
      }),
    ).toBe("https://app.example/auth");
  });

  it("trims trailing slashes from the configured URL", () => {
    expect(
      resolveOAuthRedirect({ configuredUrl: "https://app.example/auth/", origin: "http://x" }),
    ).toBe("https://app.example/auth");
  });

  it("falls back to <origin>/auth only when nothing is configured", () => {
    expect(
      resolveOAuthRedirect({ configuredUrl: undefined, origin: "http://localhost:8080" }),
    ).toBe("http://localhost:8080/auth");
  });

  it("ignores a blank configured URL", () => {
    expect(resolveOAuthRedirect({ configuredUrl: "   ", origin: "http://localhost:8080" })).toBe(
      "http://localhost:8080/auth",
    );
  });
});

describe("googleOAuthOptions", () => {
  it("passes the exact redirect, minimal scopes and account chooser", () => {
    const opts = googleOAuthOptions({ configuredUrl: undefined, origin: "http://localhost:8080" });
    expect(opts).toEqual({
      redirectTo: "http://localhost:8080/auth",
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
    });
  });
});
