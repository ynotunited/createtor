import { describe, expect, it } from "vitest";

import { confirmationMatches, erasureBlockReason } from "@/lib/account-policy";

describe("confirmationMatches", () => {
  it("matches ignoring case and surrounding whitespace", () => {
    expect(confirmationMatches("Ada@Example.com", " ada@example.com ")).toBe(true);
  });

  it("is false on a mismatch or missing value", () => {
    expect(confirmationMatches("a@b.co", "c@d.co")).toBe(false);
    expect(confirmationMatches(null, "a@b.co")).toBe(false);
    expect(confirmationMatches("a@b.co", "")).toBe(false);
    expect(confirmationMatches(undefined, undefined)).toBe(false);
  });
});

describe("erasureBlockReason", () => {
  it("blocks erasing yourself", () => {
    expect(erasureBlockReason({ targetId: "u1", actorId: "u1", targetRoles: [] })).toMatch(
      /own account/,
    );
  });

  it("blocks erasing a super-admin", () => {
    expect(
      erasureBlockReason({ targetId: "u2", actorId: "u1", targetRoles: ["super_admin"] }),
    ).toMatch(/Super administrators/);
  });

  it("allows erasing an ordinary user", () => {
    expect(
      erasureBlockReason({ targetId: "u2", actorId: "u1", targetRoles: ["admin"] }),
    ).toBeNull();
    expect(erasureBlockReason({ targetId: "u2", actorId: "u1", targetRoles: [] })).toBeNull();
  });
});
