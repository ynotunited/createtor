import { describe, expect, it } from "vitest";

import { decideCheckoutIntent, type CheckoutIntentRecord } from "@/lib/checkout-intents";

const ctx = { userId: "user-1", workspaceId: "ws-1" };

function record(overrides: Partial<CheckoutIntentRecord> = {}): CheckoutIntentRecord {
  return {
    id: "intent-1",
    user_id: "user-1",
    workspace_id: "ws-1",
    provider: "stripe",
    status: "pending",
    redirect_url: null,
    ...overrides,
  };
}

describe("decideCheckoutIntent", () => {
  it("treats a missing row as a fresh request", () => {
    expect(decideCheckoutIntent(null, ctx)).toEqual({ kind: "fresh" });
  });

  it("replays the cached redirect instead of re-charging", () => {
    const decision = decideCheckoutIntent(
      record({ status: "created", redirect_url: "https://checkout.stripe.com/abc" }),
      ctx,
    );
    expect(decision).toEqual({
      kind: "replay",
      url: "https://checkout.stripe.com/abc",
      provider: "stripe",
    });
  });

  it("reclaims a previously failed attempt", () => {
    expect(decideCheckoutIntent(record({ status: "failed" }), ctx)).toEqual({
      kind: "reclaim",
      intentId: "intent-1",
    });
  });

  it("reports an in-flight attempt as pending", () => {
    expect(decideCheckoutIntent(record({ status: "pending" }), ctx)).toEqual({ kind: "pending" });
  });

  it("treats a created row without a URL as still pending", () => {
    expect(decideCheckoutIntent(record({ status: "created", redirect_url: null }), ctx)).toEqual({
      kind: "pending",
    });
  });

  it("rejects a key owned by another user", () => {
    expect(
      decideCheckoutIntent(
        record({ user_id: "someone-else", status: "created", redirect_url: "x" }),
        ctx,
      ),
    ).toEqual({ kind: "conflict" });
  });

  it("rejects a key owned by another workspace", () => {
    expect(decideCheckoutIntent(record({ workspace_id: "other-ws" }), ctx)).toEqual({
      kind: "conflict",
    });
  });
});
