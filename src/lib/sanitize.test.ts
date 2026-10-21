import { describe, expect, it } from "vitest";

import { sanitizePostgrestOrTerm } from "@/lib/sanitize";

describe("sanitizePostgrestOrTerm", () => {
  it("keeps ordinary search text, including email-shaped input", () => {
    expect(sanitizePostgrestOrTerm("john.doe@example.com")).toBe("john.doe@example.com");
    expect(sanitizePostgrestOrTerm("Acme Corp")).toBe("Acme Corp");
  });

  it("strips PostgREST grammar characters used to inject filter conditions", () => {
    expect(sanitizePostgrestOrTerm('x,full_name.ilike."%admin%')).toBe(
      "x full_name.ilike. %admin%",
    );
    expect(sanitizePostgrestOrTerm("a,b(c)")).toBe("a b c");
    expect(sanitizePostgrestOrTerm("back\\slash")).toBe("back slash");
  });

  it("removes control characters and collapses whitespace", () => {
    expect(sanitizePostgrestOrTerm("a\u0000b\tc\n\n  d")).toBe("a b c d");
  });

  it("caps the result length", () => {
    expect(sanitizePostgrestOrTerm("x".repeat(500), 200)).toHaveLength(200);
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(sanitizePostgrestOrTerm('  ,()"\\  ')).toBe("");
  });
});
