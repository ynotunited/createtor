/**
 * Billing orchestration shared by checkout server functions and payment
 * webhooks. All writes go through the service role, so the browser can never
 * self-upgrade a plan.
 *
 * Financial history is append-only: every state change is written to
 * `payment_ledger` as a brand-new row (see {@link appendPaymentLedger}). The
 * `subscriptions` row is only a derived, rebuildable projection of the latest
 * ledger entry, so nothing in the audit trail is ever overwritten.
 *
 * Two independent idempotency layers protect against duplicate charges:
 *   - `payment_events` de-duplicates provider webhook deliveries.
 *   - `checkout_intents` de-duplicates client-issued checkout requests via a
 *     client-generated key, so a retried request returns the cached redirect.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decideCheckoutIntent, type CheckoutIntentRecord } from "@/lib/checkout-intents";
import { PLANS, type BillingCycle, type PlanKey } from "@/lib/pricing";
import { resolveCyclePricing, type PaymentGatewayId } from "@/lib/platform-config.server";
import type { Json } from "@/integrations/supabase/types";

export function getPlan(planKey: PlanKey) {
  const plan = PLANS.find((p) => p.key === planKey);
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);
  return plan;
}

/**
 * Billing writes must never fail silently: an ignored PostgREST error would
 * leave the subscription/plan/credits inconsistent while the webhook reports
 * success. Throwing lets the event lifecycle mark the event failed so the
 * provider's retry can reprocess it.
 */
function assertOk(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/** The lump sum actually charged for a cycle (yearly is one annual charge). */
export function cycleAmountUsd(planKey: PlanKey, cycle: BillingCycle): number {
  const plan = getPlan(planKey);
  return cycle === "yearly" ? plan.yearlyPriceUsd : plan.monthlyPriceUsd;
}

/** Credits granted per billing period (annual grants a full year up front). */
export function cycleCredits(planKey: PlanKey, cycle: BillingCycle): number {
  const plan = getPlan(planKey);
  return plan.monthlyCredits * (cycle === "yearly" ? 12 : 1);
}

export async function isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (ws?.owner_id === userId) return true;
  const { data: member } = await supabaseAdmin
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(member);
}

export async function getWorkspace(workspaceId: string) {
  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, owner_id, plan")
    .eq("id", workspaceId)
    .maybeSingle();
  assertOk(error, "read workspace");
  return data;
}

export async function getBillingRecord(workspaceId: string) {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  assertOk(error, "read billing record");
  return data;
}

/* ------------------------------------------------------------------ */
/* Immutable payment ledger + derived subscription projection          */
/* ------------------------------------------------------------------ */

export type LedgerEntryType =
  | "checkout.intent"
  | "checkout.failed"
  | "subscription.activated"
  | "subscription.updated"
  | "subscription.past_due"
  | "subscription.canceled"
  | "subscription.expired"
  | "payment.captured"
  | "payment.failed"
  | "payment.refunded";

export type PaymentLedgerInput = {
  workspaceId: string | null;
  provider: PaymentGatewayId;
  entryType: LedgerEntryType;
  providerEventId?: string | null;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  amountUsd?: number | null;
  currency?: string;
  plan?: string | null;
  billingCycle?: string | null;
  status?: string | null;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  canceledAt?: string | null;
  metadata?: Json | undefined;
  occurredAt?: string;
};

/**
 * Appends one row to the immutable ledger. Never updates or deletes. The
 * `unique (provider, provider_event_id, entry_type)` constraint makes a replayed
 * webhook a no-op (23505) rather than a double count.
 */
export async function appendPaymentLedger(entry: PaymentLedgerInput): Promise<void> {
  const { error } = await supabaseAdmin.from("payment_ledger").insert({
    workspace_id: entry.workspaceId,
    provider: entry.provider,
    entry_type: entry.entryType,
    provider_event_id: entry.providerEventId ?? null,
    provider_subscription_id: entry.providerSubscriptionId ?? null,
    provider_customer_id: entry.providerCustomerId ?? null,
    amount_usd: entry.amountUsd ?? null,
    currency: entry.currency ?? "usd",
    plan: entry.plan ?? null,
    billing_cycle: entry.billingCycle ?? null,
    status: entry.status ?? null,
    period_end: entry.periodEnd ?? null,
    cancel_at_period_end: entry.cancelAtPeriodEnd ?? null,
    canceled_at: entry.canceledAt ?? null,
    metadata: (entry.metadata ?? {}) as Json,
    occurred_at: entry.occurredAt ?? new Date().toISOString(),
  });
  if (error && error.code !== "23505") {
    throw new Error(`Could not append payment ledger entry: ${error.message}`);
  }
}

/** The derived current-state projection stored in `public.subscriptions`. */
export type SubscriptionProjection = {
  plan: PlanKey;
  status: string;
  provider: PaymentGatewayId;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  provider_plan_id: string | null;
  billing_cycle: BillingCycle;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

export async function getSubscriptionProjection(
  workspaceId: string,
): Promise<SubscriptionProjection | null> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "plan, status, provider, provider_customer_id, provider_subscription_id, provider_plan_id, billing_cycle, current_period_end, cancel_at_period_end, canceled_at",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  assertOk(error, "read subscription projection");
  if (!data) return null;
  return {
    plan: data.plan as PlanKey,
    status: data.status,
    provider: (data.provider ?? "stripe") as PaymentGatewayId,
    provider_customer_id: data.provider_customer_id,
    provider_subscription_id: data.provider_subscription_id,
    provider_plan_id: data.provider_plan_id,
    billing_cycle: data.billing_cycle as BillingCycle,
    current_period_end: data.current_period_end,
    cancel_at_period_end: data.cancel_at_period_end,
    canceled_at: data.canceled_at,
  };
}

/**
 * Writes the derived read model. This is a cache of the latest ledger entry,
 * not the record of truth: it may be rebuilt from `payment_ledger` at any time.
 */
async function writeSubscriptionProjection(
  workspaceId: string,
  projection: SubscriptionProjection,
): Promise<void> {
  const row = { workspace_id: workspaceId, ...projection, updated_at: new Date().toISOString() };
  const { data: existing, error: readError } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  assertOk(readError, "read subscription projection id");
  if (existing) {
    const { error } = await supabaseAdmin.from("subscriptions").update(row).eq("id", existing.id);
    assertOk(error, "update subscription projection");
  } else {
    const { error } = await supabaseAdmin.from("subscriptions").insert(row);
    assertOk(error, "insert subscription projection");
  }
}

export async function findWorkspaceByProviderSubscription(
  provider: PaymentGatewayId,
  providerSubscriptionId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("workspace_id")
    .eq("provider", provider)
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();
  assertOk(error, "resolve subscription workspace");
  return data?.workspace_id ?? null;
}

export async function findWorkspaceByProviderCustomer(
  provider: PaymentGatewayId,
  providerCustomerId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("workspace_id")
    .eq("provider", provider)
    .eq("provider_customer_id", providerCustomerId)
    .maybeSingle();
  assertOk(error, "resolve customer workspace");
  return data?.workspace_id ?? null;
}

/** Grants a plan's credit allotment for the period. */
export async function grantPlanCredits(
  workspaceId: string,
  planKey: PlanKey,
  cycle: BillingCycle,
  reason: string,
): Promise<number> {
  const amount = cycleCredits(planKey, cycle);
  if (amount <= 0) return 0;

  const { data: current, error: readError } = await supabaseAdmin
    .from("usage_credits")
    .select("balance, lifetime_purchased")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  assertOk(readError, "read usage credits");

  const balance = (current?.balance ?? 0) + amount;
  const purchased = (current?.lifetime_purchased ?? 0) + amount;

  if (current) {
    const { error } = await supabaseAdmin
      .from("usage_credits")
      .update({ balance, lifetime_purchased: purchased })
      .eq("workspace_id", workspaceId);
    assertOk(error, "update usage credits");
  } else {
    const { error } = await supabaseAdmin
      .from("usage_credits")
      .insert({ workspace_id: workspaceId, balance, lifetime_purchased: purchased });
    assertOk(error, "insert usage credits");
  }

  const { error: txError } = await supabaseAdmin.from("credit_transactions").insert({
    workspace_id: workspaceId,
    amount,
    kind: "purchase",
    reason,
  });
  assertOk(txError, "record credit transaction");
  return amount;
}

export type ApplySubscriptionArgs = {
  workspaceId: string;
  provider: PaymentGatewayId;
  planKey: PlanKey;
  cycle: BillingCycle;
  status: string;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  providerPlanId?: string | null;
  currentPeriodEnd?: string | null;
  /** Provider webhook event id, when the call originates from a webhook. */
  providerEventId?: string | null;
  /** Actual charged amount when known (from the provider); else DB pricing is used. */
  amountUsd?: number | null;
};

/**
 * Activates/renews a subscription: appends the ledger entry, rewrites the
 * derived projection, upgrades the workspace plan and (for newly-active
 * subscriptions) grants period credits.
 */
export async function applyPaidSubscription(args: ApplySubscriptionArgs): Promise<void> {
  const existing = await getSubscriptionProjection(args.workspaceId);

  const isNewActivation =
    args.status === "active" &&
    (!existing || existing.status !== "active" || existing.plan !== args.planKey);

  // Prefer the amount the provider actually charged; fall back to the configured
  // database price so the ledger never records a hardcoded figure.
  let amountUsd = args.amountUsd ?? null;
  if (amountUsd === null) {
    const pricing = await resolveCyclePricing(args.planKey, args.cycle);
    amountUsd = pricing ? pricing.amountCents / 100 : cycleAmountUsd(args.planKey, args.cycle);
  }

  const projection: SubscriptionProjection = {
    plan: args.planKey,
    status: args.status,
    provider: args.provider,
    provider_customer_id: args.providerCustomerId ?? existing?.provider_customer_id ?? null,
    provider_subscription_id:
      args.providerSubscriptionId ?? existing?.provider_subscription_id ?? null,
    provider_plan_id: args.providerPlanId ?? existing?.provider_plan_id ?? null,
    billing_cycle: args.cycle,
    current_period_end: args.currentPeriodEnd ?? null,
    cancel_at_period_end: false,
    canceled_at: null,
  };

  // Write the immutable ledger entry first; the projection is derived from it.
  await appendPaymentLedger({
    workspaceId: args.workspaceId,
    provider: args.provider,
    entryType: isNewActivation ? "subscription.activated" : "subscription.updated",
    providerEventId: args.providerEventId ?? null,
    providerSubscriptionId: projection.provider_subscription_id,
    providerCustomerId: projection.provider_customer_id,
    amountUsd,
    plan: args.planKey,
    billingCycle: args.cycle,
    status: args.status,
    periodEnd: projection.current_period_end,
    cancelAtPeriodEnd: false,
    metadata: { planKey: args.planKey, cycle: args.cycle },
  });

  await writeSubscriptionProjection(args.workspaceId, projection);

  const { error: planError } = await supabaseAdmin
    .from("workspaces")
    .update({ plan: args.planKey })
    .eq("id", args.workspaceId);
  assertOk(planError, "apply workspace plan");

  if (isNewActivation) {
    await grantPlanCredits(
      args.workspaceId,
      args.planKey,
      args.cycle,
      `${args.provider} ${args.cycle} ${args.planKey} subscription`,
    );
    const { auditEvent } = await import("@/lib/audit.server");
    await auditEvent({
      actorId: null,
      action: "subscription.activated",
      entity: "subscriptions",
      entityId: args.workspaceId,
      workspaceId: args.workspaceId,
      metadata: { provider: args.provider, planKey: args.planKey, cycle: args.cycle },
    });
  }
}

export type SubscriptionStatusLedgerContext = {
  provider: PaymentGatewayId;
  entryType: LedgerEntryType;
  providerEventId?: string | null;
  amountUsd?: number | null;
  metadata?: Json;
};

/**
 * Reflects a status change (past_due, canceled) without granting credits.
 * Appends the ledger entry before rewriting the derived projection.
 */
export async function updateSubscriptionStatus(
  workspaceId: string,
  status: string,
  extra?: {
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: string | null;
  },
  ledger?: SubscriptionStatusLedgerContext,
): Promise<void> {
  const existing = await getSubscriptionProjection(workspaceId);
  const projection: SubscriptionProjection = {
    plan: existing?.plan ?? "free",
    status,
    provider: ledger?.provider ?? existing?.provider ?? "stripe",
    provider_customer_id: existing?.provider_customer_id ?? null,
    provider_subscription_id: existing?.provider_subscription_id ?? null,
    provider_plan_id: existing?.provider_plan_id ?? null,
    billing_cycle: existing?.billing_cycle ?? "monthly",
    current_period_end:
      extra?.currentPeriodEnd !== undefined
        ? extra.currentPeriodEnd
        : (existing?.current_period_end ?? null),
    cancel_at_period_end:
      extra?.cancelAtPeriodEnd !== undefined
        ? extra.cancelAtPeriodEnd
        : (existing?.cancel_at_period_end ?? false),
    canceled_at:
      extra?.canceledAt !== undefined ? extra.canceledAt : (existing?.canceled_at ?? null),
  };

  await appendPaymentLedger({
    workspaceId,
    provider: projection.provider,
    entryType: ledger?.entryType ?? "subscription.updated",
    providerEventId: ledger?.providerEventId ?? null,
    providerSubscriptionId: projection.provider_subscription_id,
    providerCustomerId: projection.provider_customer_id,
    amountUsd: ledger?.amountUsd ?? null,
    plan: projection.plan,
    billingCycle: projection.billing_cycle,
    status,
    periodEnd: projection.current_period_end,
    cancelAtPeriodEnd: projection.cancel_at_period_end,
    canceledAt: projection.canceled_at,
    metadata: ledger?.metadata,
  });

  await writeSubscriptionProjection(workspaceId, projection);
}

/** Moves a workspace back to the free plan (subscription ended/refunded). */
export async function downgradeWorkspace(
  workspaceId: string,
  reason: string,
  ledger?: { provider: PaymentGatewayId; providerEventId?: string | null },
): Promise<void> {
  const existing = await getSubscriptionProjection(workspaceId);
  const canceledAt = new Date().toISOString();
  const projection: SubscriptionProjection = {
    plan: "free",
    status: "canceled",
    provider: ledger?.provider ?? existing?.provider ?? "stripe",
    provider_customer_id: existing?.provider_customer_id ?? null,
    provider_subscription_id: existing?.provider_subscription_id ?? null,
    provider_plan_id: existing?.provider_plan_id ?? null,
    billing_cycle: existing?.billing_cycle ?? "monthly",
    current_period_end: existing?.current_period_end ?? null,
    cancel_at_period_end: false,
    canceled_at: canceledAt,
  };

  await appendPaymentLedger({
    workspaceId,
    provider: projection.provider,
    entryType: "subscription.expired",
    providerEventId: ledger?.providerEventId ?? null,
    providerSubscriptionId: projection.provider_subscription_id,
    providerCustomerId: projection.provider_customer_id,
    plan: "free",
    billingCycle: projection.billing_cycle,
    status: "canceled",
    periodEnd: projection.current_period_end,
    cancelAtPeriodEnd: false,
    canceledAt,
    metadata: { reason },
  });

  const { error: planError } = await supabaseAdmin
    .from("workspaces")
    .update({ plan: "free" })
    .eq("id", workspaceId);
  assertOk(planError, "downgrade workspace plan");

  await writeSubscriptionProjection(workspaceId, projection);
  await grantFreeMonthly(workspaceId, reason);
}

/** Makes sure a free workspace still has its monthly allotment floor. */
async function grantFreeMonthly(workspaceId: string, reason: string): Promise<void> {
  const freeCredits = getPlan("free").monthlyCredits;
  const { data: current, error: readError } = await supabaseAdmin
    .from("usage_credits")
    .select("balance")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  assertOk(readError, "read usage credits");
  if (!current || current.balance >= freeCredits) return;
  const amount = freeCredits - current.balance;
  const { error: updateError } = await supabaseAdmin
    .from("usage_credits")
    .update({ balance: freeCredits, free_grant_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId);
  assertOk(updateError, "apply free credits floor");
  const { error: txError } = await supabaseAdmin.from("credit_transactions").insert({
    workspace_id: workspaceId,
    amount,
    kind: "grant",
    reason,
  });
  assertOk(txError, "record free credit grant");
}

/** How long an in-flight event may sit before another delivery may reclaim it. */
const PAYMENT_EVENT_STALE_MS = 5 * 60 * 1000;

export type PaymentEventClaim = "new" | "retry" | "skip";

/**
 * Claims a webhook event for processing. The event row is created (or reclaimed)
 * *before* the handler runs, but is only marked `processed` by
 * {@link finishPaymentEvent} once handling succeeds. This makes delivery
 * at-least-once-safe: a transient handler failure leaves the row `processing` /
 * `failed`, so the provider's retry reclaims and reprocesses it instead of being
 * silently dropped as a duplicate.
 *
 * Returns `"new"`/`"retry"` when the caller must run the handler, or `"skip"`
 * when the event is already processed or another delivery is handling it.
 */
export async function beginPaymentEvent(args: {
  provider: PaymentGatewayId;
  eventId: string;
  type: string;
  workspaceId: string | null;
  payload: unknown;
}): Promise<PaymentEventClaim> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("payment_events").insert({
    provider: args.provider,
    event_id: args.eventId,
    type: args.type,
    workspace_id: args.workspaceId,
    payload: (args.payload ?? {}) as Json,
    status: "processing",
    updated_at: now,
  });
  if (!error) return "new";
  if (error.code !== "23505") {
    throw new Error(`Could not record payment event: ${error.message}`);
  }

  // A row already exists. Reclaim it only if a previous attempt failed, so a
  // provider retry is not lost.
  const { data: reclaimedFailed } = await supabaseAdmin
    .from("payment_events")
    .update({ status: "processing", last_error: null, updated_at: now })
    .eq("provider", args.provider)
    .eq("event_id", args.eventId)
    .eq("status", "failed")
    .select("id");
  if (reclaimedFailed && reclaimedFailed.length > 0) return "retry";

  // Or if a prior attempt is stuck (worker died mid-handler).
  const staleBefore = new Date(Date.now() - PAYMENT_EVENT_STALE_MS).toISOString();
  const { data: reclaimedStale } = await supabaseAdmin
    .from("payment_events")
    .update({ status: "processing", last_error: null, updated_at: now })
    .eq("provider", args.provider)
    .eq("event_id", args.eventId)
    .eq("status", "processing")
    .lt("updated_at", staleBefore)
    .select("id");
  if (reclaimedStale && reclaimedStale.length > 0) return "retry";

  // Already processed, or another delivery is actively handling it.
  return "skip";
}

/** Marks a claimed event processed, or failed (so a retry can reclaim it). */
export async function finishPaymentEvent(
  provider: PaymentGatewayId,
  eventId: string,
  outcome: { ok: true } | { ok: false; error: string },
): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("payment_events")
    .update({
      status: outcome.ok ? "processed" : "failed",
      last_error: outcome.ok ? null : outcome.error,
      processed_at: outcome.ok ? now : null,
      updated_at: now,
    })
    .eq("provider", provider)
    .eq("event_id", eventId);
}

/* ------------------------------------------------------------------ */
/* Checkout idempotency (client-generated keys)                        */
/* ------------------------------------------------------------------ */

export type CheckoutClaim =
  | { kind: "proceed"; intentId: string }
  | { kind: "replay"; url: string; provider: string }
  | { kind: "pending" }
  | { kind: "conflict" };

/**
 * Records a client idempotency key before any provider call. A duplicate key
 * either replays the cached redirect, reclaims a failed attempt, or reports the
 * request as in flight. The claim row is written first so a crash between here
 * and the provider call still leaves a durable trace of the attempt.
 */
export async function claimCheckoutIntent(args: {
  idempotencyKey: string;
  userId: string;
  workspaceId: string;
  provider: PaymentGatewayId;
  planKey: PlanKey;
  cycle: BillingCycle;
}): Promise<CheckoutClaim> {
  const now = new Date().toISOString();
  const { data: inserted, error } = await supabaseAdmin
    .from("checkout_intents")
    .insert({
      idempotency_key: args.idempotencyKey,
      user_id: args.userId,
      workspace_id: args.workspaceId,
      provider: args.provider,
      plan: args.planKey,
      billing_cycle: args.cycle,
      status: "pending",
      updated_at: now,
    })
    .select("id")
    .maybeSingle();
  if (!error && inserted) return { kind: "proceed", intentId: inserted.id };
  if (error && error.code !== "23505") {
    throw new Error(`Could not record checkout intent: ${error.message}`);
  }

  const { data: existing, error: readError } = await supabaseAdmin
    .from("checkout_intents")
    .select("id, user_id, workspace_id, provider, status, redirect_url")
    .eq("idempotency_key", args.idempotencyKey)
    .maybeSingle();
  assertOk(readError, "read checkout intent");

  const decision = decideCheckoutIntent((existing as CheckoutIntentRecord | null) ?? null, {
    userId: args.userId,
    workspaceId: args.workspaceId,
  });

  if (decision.kind === "reclaim") {
    const { error: reclaimError } = await supabaseAdmin
      .from("checkout_intents")
      .update({ status: "pending", last_error: null, updated_at: now })
      .eq("id", decision.intentId)
      .eq("status", "failed");
    if (reclaimError) throw new Error(`Could not reclaim checkout intent: ${reclaimError.message}`);
    return { kind: "proceed", intentId: decision.intentId };
  }
  if (decision.kind === "fresh") {
    // Defensive: the insert reported a conflict but the row is gone.
    if (!existing) return { kind: "conflict" };
    return { kind: "proceed", intentId: existing.id };
  }
  return decision;
}

/** Caches the created provider redirect against the idempotency key. */
export async function completeCheckoutIntent(
  intentId: string,
  url: string,
  providerSessionId?: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("checkout_intents")
    .update({
      status: "created",
      redirect_url: url,
      provider_session_id: providerSessionId ?? null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", intentId);
  assertOk(error, "complete checkout intent");
}

/** Marks a failed attempt so the same key may be retried. */
export async function failCheckoutIntent(intentId: string, message: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("checkout_intents")
    .update({
      status: "failed",
      last_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", intentId);
  assertOk(error, "fail checkout intent");
}

export async function getUserEmail(userId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.email) return profile.email;
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}
