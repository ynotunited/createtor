import { describe, expect, it } from "vitest";

import { checkDatabaseSeparation, environmentBanner, projectRefFromUrl } from "./env.server";

describe("projectRefFromUrl", () => {
  it("extracts the ref from a standard project URL", () => {
    expect(projectRefFromUrl("https://tctkthyxgqfwhqnmsidq.supabase.co")).toBe(
      "tctkthyxgqfwhqnmsidq",
    );
  });

  it("is case-insensitive and tolerates trailing slashes", () => {
    expect(projectRefFromUrl("https://ABCDEFGHIJKLMNOPQRST.supabase.co/")).toBe(
      "abcdefghijklmnopqrst",
    );
  });

  it("returns null for non-supabase URLs", () => {
    expect(projectRefFromUrl("https://example.com")).toBeNull();
    expect(projectRefFromUrl("")).toBeNull();
  });
});

describe("checkDatabaseSeparation", () => {
  it("allows production regardless of target", () => {
    const result = checkDatabaseSeparation({
      NODE_ENV: "production",
      SUPABASE_PROJECT_ID: "prodref",
      PRODUCTION_SUPABASE_PROJECT_ID: "prodref",
    });
    expect(result.ok).toBe(true);
  });

  it("blocks a development build pointed at the production project", () => {
    const result = checkDatabaseSeparation({
      NODE_ENV: "development",
      SUPABASE_PROJECT_ID: "prodref",
      PRODUCTION_SUPABASE_PROJECT_ID: "prodref",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("prodref");
  });

  it("blocks when only the production URL is configured", () => {
    const result = checkDatabaseSeparation({
      NODE_ENV: "development",
      SUPABASE_URL: "https://prodref.supabase.co",
      PRODUCTION_SUPABASE_URL: "https://prodref.supabase.co",
    });
    expect(result.ok).toBe(false);
  });

  it("allows a development build on a different project", () => {
    const result = checkDatabaseSeparation({
      NODE_ENV: "development",
      SUPABASE_PROJECT_ID: "devref",
      PRODUCTION_SUPABASE_PROJECT_ID: "prodref",
    });
    expect(result.ok).toBe(true);
  });

  it("is inert until a production target is declared", () => {
    const result = checkDatabaseSeparation({
      NODE_ENV: "development",
      SUPABASE_PROJECT_ID: "prodref",
    });
    expect(result.ok).toBe(true);
  });

  it("honours the deliberate override", () => {
    const result = checkDatabaseSeparation({
      NODE_ENV: "development",
      SUPABASE_PROJECT_ID: "prodref",
      PRODUCTION_SUPABASE_PROJECT_ID: "prodref",
      ALLOW_PRODUCTION_DATA: "1",
    });
    expect(result.ok).toBe(true);
  });
});

describe("environmentBanner", () => {
  it("reports the environment and refs without secrets", () => {
    const line = environmentBanner({
      APP_ENV: "development",
      SUPABASE_PROJECT_ID: "devref",
      PRODUCTION_SUPABASE_PROJECT_ID: "prodref",
    });
    expect(line).toContain("environment=development");
    expect(line).toContain("supabase=devref");
    expect(line).toContain("production=prodref");
  });
});
