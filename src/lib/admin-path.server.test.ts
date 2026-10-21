import { describe, expect, it } from "vitest";

import { classifyAdminPath, resolveAdminPath } from "@/lib/admin-path.server";

describe("resolveAdminPath", () => {
  it("returns empty when unset or blank", () => {
    expect(resolveAdminPath({})).toBe("");
    expect(resolveAdminPath({ ADMIN_PATH: "   " })).toBe("");
  });

  it("normalises a valid custom path", () => {
    expect(resolveAdminPath({ ADMIN_PATH: "Control-Room" })).toBe("control-room");
  });

  it("rejects unsafe or reserved values so access can never widen", () => {
    for (const bad of ["admin", "api", "assets", "a", "ab", "has space", "a/b", "-lead"]) {
      expect(resolveAdminPath({ ADMIN_PATH: bad })).toBe("");
    }
  });
});

describe("classifyAdminPath", () => {
  it("passes everything through when no custom path is configured", () => {
    expect(classifyAdminPath("/admin/audit", "")).toEqual({ kind: "pass" });
    expect(classifyAdminPath("/admin/audit", "admin")).toEqual({ kind: "pass" });
  });

  it("rewrites the secret path to the real admin route tree", () => {
    expect(classifyAdminPath("/control-room", "control-room")).toEqual({
      kind: "rewrite",
      pathname: "/admin",
    });
    expect(classifyAdminPath("/control-room/users/123", "control-room")).toEqual({
      kind: "rewrite",
      pathname: "/admin/users/123",
    });
  });

  it("404s the literal /admin decoy when a custom path is set", () => {
    expect(classifyAdminPath("/admin", "control-room")).toEqual({ kind: "not_found" });
    expect(classifyAdminPath("/admin/audit", "control-room")).toEqual({ kind: "not_found" });
  });

  it("passes unrelated paths through untouched", () => {
    expect(classifyAdminPath("/dashboard", "control-room")).toEqual({ kind: "pass" });
    expect(classifyAdminPath("/api/health", "control-room")).toEqual({ kind: "pass" });
  });
});
