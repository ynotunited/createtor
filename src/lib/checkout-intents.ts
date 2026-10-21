/**
 * Pure decision logic for client-supplied checkout idempotency keys.
 *
 * Kept free of I/O so the duplicate-request rules (replay, reclaim, conflict)
 * are unit-testable without a database. The database-backed wrapper lives in
 * `billing.server.ts`.
 */

export type CheckoutIntentStatus = "pending" | "created" | "failed";

export type CheckoutIntentRecord = {
  id: string;
  user_id: string;
  workspace_id: string;
  provider: string;
  status: CheckoutIntentStatus;
  redirect_url: string | null;
};

export type CheckoutIntentDecision =
  /** No row for this key yet: the caller may create the session. */
  | { kind: "fresh" }
  /** A previous attempt succeeded and was cached: return it, never re-charge. */
  | { kind: "replay"; url: string; provider: string }
  /** A previous attempt failed: safe to retry under the same key. */
  | { kind: "reclaim"; intentId: string }
  /** Another request is already in flight for this key. */
  | { kind: "pending" }
  /** The key belongs to a different user/workspace: reject. */
  | { kind: "conflict" };

/**
 * Decides how to handle a checkout request for `idempotencyKey` given the row
 * already stored for it (or `null` when none exists).
 */
export function decideCheckoutIntent(
  existing: CheckoutIntentRecord | null,
  ctx: { userId: string; workspaceId: string },
): CheckoutIntentDecision {
  if (!existing) return { kind: "fresh" };
  if (existing.user_id !== ctx.userId || existing.workspace_id !== ctx.workspaceId) {
    return { kind: "conflict" };
  }
  if (existing.status === "created" && existing.redirect_url) {
    return { kind: "replay", url: existing.redirect_url, provider: existing.provider };
  }
  if (existing.status === "failed") return { kind: "reclaim", intentId: existing.id };
  // status === "pending" (or "created" without a stored URL): in flight.
  return { kind: "pending" };
}
