import { z } from "zod";

import { PLANS, type BillingCycle, type PlanKey } from "@/lib/pricing";

const UUID = z.string().uuid();
const PAID_PLANS = new Set<PlanKey>(PLANS.filter((p) => p.key !== "free").map((p) => p.key));
const CYCLES = new Set<BillingCycle>(["monthly", "yearly"]);

export type PaypalCustomId = {
  workspaceId: string;
  planKey: PlanKey;
  cycle: BillingCycle;
};

/**
 * Parses the `custom_id` embedded in a PayPal subscription
 * (`<workspaceId>:<planKey>:<cycle>`).
 *
 * This value travels through PayPal, so treat it as untrusted input: validate
 * the UUID, restrict the plan to a real paid tier and the cycle to a known
 * value. Rejecting here prevents a forged/malformed id from reaching billing
 * writes or pointing at a workspace that was never checked out.
 */
export function parsePaypalCustomId(raw: unknown): PaypalCustomId | null {
  if (typeof raw !== "string") return null;

  const parts = raw.split(":");
  if (parts.length !== 3) return null;

  const [workspaceId, planKey, cycle] = parts;
  if (!workspaceId || !planKey || !cycle) return null;
  if (!UUID.safeParse(workspaceId).success) return null;
  if (!PAID_PLANS.has(planKey as PlanKey)) return null;
  if (!CYCLES.has(cycle as BillingCycle)) return null;

  return { workspaceId, planKey: planKey as PlanKey, cycle: cycle as BillingCycle };
}
