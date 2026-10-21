import { describe, expect, it } from "vitest";

import { defaultWorkspaceName, isMissingFunctionError } from "@/lib/workspace-helpers";

describe("defaultWorkspaceName", () => {
  it("uses the email local-part", () => {
    expect(defaultWorkspaceName("ada@example.com")).toBe("ada workspace");
  });

  it("falls back when the email is missing or unusable", () => {
    expect(defaultWorkspaceName(undefined)).toBe("My workspace");
    expect(defaultWorkspaceName(null)).toBe("My workspace");
    expect(defaultWorkspaceName("")).toBe("My workspace");
    expect(defaultWorkspaceName("@example.com")).toBe("My workspace");
    expect(defaultWorkspaceName("   ")).toBe("My workspace");
  });
});

describe("isMissingFunctionError", () => {
  it("recognizes PostgREST/Postgres missing-function codes", () => {
    expect(isMissingFunctionError({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunctionError({ code: "42883" })).toBe(true);
  });

  it("recognizes missing-function messages", () => {
    expect(
      isMissingFunctionError({
        message: "Could not find the function public.ensure_workspace in the schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingFunctionError({ message: "function public.ensure_workspace does not exist" }),
    ).toBe(true);
  });

  it("does not swallow unrelated errors", () => {
    expect(isMissingFunctionError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingFunctionError({})).toBe(false);
    expect(isMissingFunctionError({ message: null })).toBe(false);
  });
});
