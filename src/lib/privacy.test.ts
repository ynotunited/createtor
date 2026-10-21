import { describe, expect, it } from "vitest";

import { maskEventProps, SESSION_REPLAY } from "@/lib/privacy";

describe("session replay defaults", () => {
  it("is off by default with inputs masked", () => {
    expect(SESSION_REPLAY.enabled).toBe(false);
    expect(SESSION_REPLAY.maskAllInputs).toBe(true);
  });
});

describe("maskEventProps", () => {
  it("keeps harmless primitive values", () => {
    expect(maskEventProps({ plan: "pro", count: 3, yearly: true })).toEqual({
      plan: "pro",
      count: 3,
      yearly: true,
    });
  });

  it("drops sensitive keys", () => {
    expect(
      maskEventProps({ password: "hunter2", email: "a@b.co", token: "x", card: "4111" }),
    ).toBeUndefined();
  });

  it("drops non-primitive values and truncates long strings", () => {
    expect(maskEventProps({ meta: { a: 1 }, note: "x".repeat(500) })).toEqual({
      note: "x".repeat(120),
    });
  });

  it("returns undefined for empty or missing props", () => {
    expect(maskEventProps(undefined)).toBeUndefined();
    expect(maskEventProps({})).toBeUndefined();
  });
});
