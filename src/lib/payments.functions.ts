import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  appendPaymentLedger,
  claimCheckoutIntent,
  completeCheckoutIntent,
  failCheckoutIntent,
  getBillingRecord,
  getPlan,
  getUserEmail,
  isWorkspaceMember,
  updateSubscriptionStatus,
} from "@/lib/billing.server";
import { isServerProduction } from "@/lib/env.server";
import { createPaypalSubscription, ensurePaypalPlan } from "@/lib/paypal.server";
import {
  loadPaymentAvailability,
  loadPaymentRuntime,
  loadPublicPricing,
  resolveCyclePricing,
} from "@/lib/platform-config.server";
import {
  createStripeCheckout,
  createStripePortal,
  setStripeCancelAtPeriodEnd,
} from "@/lib/stripe.server";
import type { BillingCycle, PlanKey } from "@/lib/pricing";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * The public origin used for checkout / portal return URLs.
 *
 * It is taken only from configuration. Falling back to the request `Host`
 * header would let an attacker redirect provider return traffic (checkout
 * success, portal back) to a host they control, so instead we fail closed.
 * Localhost is permitted outside production so local development keeps working.
 */
async function resolveOrigin(): Promise<string> {
  const envUrl = (process.env["PUBLIC_APP_URL"] ?? process.env["APP_URL"])?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");

  if (!isServerProduction()) {
    const { getRequest } = await import("@tanstack/react-start/server");
    const url = new URL(getRequest().url);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") {
      return `${url.protocol}//${url.host}`;
    }
  }

  throw new Error(
    "The application URL is not configured. Set PUBLIC_APP_URL (or APP_URL) before starting checkout.",
  );
}

const checkoutInput = z.object({
  workspaceId: z.string().uuid(),
  planKey: z.enum(["creator", "pro", "agency"]),
  cycle: z.enum(["monthly", "yearly"]),
  provider: z.enum(["stripe", "paypal"]),
  // Client-generated (crypto.randomUUID) and stable for the life of one
  // checkout attempt, so a retry after a network timeout is de-duplicated.
  idempotencyKey: z.string().uuid(),
});

/* ------------------------------------------------------------------ */
/* Availability (public)                                               */
/* ------------------------------------------------------------------ */

export const getPaymentAvailability = createServerFn({ method: "GET" }).handler(async () => {
  return loadPaymentAvailability();
});

/**
 * Public plan pricing for the billing/landing UI. Amounts are the server's
 * source of truth (from the database), so the displayed price can never diverge
 * from what checkout charges. No provider ids are exposed.
 */
export const getPricing = createServerFn({ method: "GET" }).handler(async () => {
  return loadPublicPricing();
});

/* ------------------------------------------------------------------ */
/* Billing state                                                       */
/* ------------------------------------------------------------------ */

export const getBillingState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { userId: string };
    if (!(await isWorkspaceMember(ctx.userId, data.workspaceId))) {
      throw new Error("You do not have access to this workspace.");
    }
    const [subscription, availability] = await Promise.all([
      getBillingRecord(data.workspaceId),
      loadPaymentAvailability(),
    ]);
    return {
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            provider: subscription.provider,
            billingCycle: subscription.billing_cycle,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          }
        : null,
      availability,
    };
  });

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => checkoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { userId: string };
    if (!(await isWorkspaceMember(ctx.userId, data.workspaceId))) {
      throw new Error("You do not have access to this workspace.");
    }

    const availability = await loadPaymentAvailability();
    if (!availability[data.provider]) {
      throw new Error(
        `${data.provider === "stripe" ? "Stripe" : "PayPal"} is not available right now.`,
      );
    }

    const runtime = await loadPaymentRuntime();
    const plan = getPlan(data.planKey as PlanKey);
    const origin = await resolveOrigin();
    if (!origin) throw new Error("Could not determine the application URL for checkout.");

    // The price is resolved entirely on the server from the database config; the
    // client only ever sends the plan and cycle. A plan/cycle with no configured
    // price (or an unconfigured Stripe price id) cannot be checked out.
    const price = await resolveCyclePricing(data.planKey as PlanKey, data.cycle as BillingCycle);
    if (!price) {
      throw new Error("This plan is not available for purchase right now.");
    }
    const amountUsd = price.amountCents / 100;

    // 1) Claim the client idempotency key *before* the provider is touched. A
    //    duplicate request returns the cached redirect instead of re-charging.
    const claim = await claimCheckoutIntent({
      idempotencyKey: data.idempotencyKey,
      userId: ctx.userId,
      workspaceId: data.workspaceId,
      provider: data.provider,
      planKey: data.planKey as PlanKey,
      cycle: data.cycle as BillingCycle,
    });
    if (claim.kind === "replay") {
      return { url: claim.url, provider: data.provider, replayed: true };
    }
    if (claim.kind === "pending") {
      throw new Error("A checkout for this request is already being created. Please try again.");
    }
    if (claim.kind === "conflict") {
      throw new Error("This checkout reference is no longer valid. Please start again.");
    }

    // 2) Write the intent to the immutable ledger before calling the API.
    await appendPaymentLedger({
      workspaceId: data.workspaceId,
      provider: data.provider,
      entryType: "checkout.intent",
      providerEventId: data.idempotencyKey,
      amountUsd,
      plan: data.planKey,
      billingCycle: data.cycle,
      status: "pending",
      metadata: { planKey: data.planKey, cycle: data.cycle },
    });

    try {
      let url: string;
      let providerSessionId: string | null = null;

      if (data.provider === "stripe") {
        if (!price.stripePriceId) {
          throw new Error("Stripe checkout is not configured for this plan.");
        }
        const email = await getUserEmail(ctx.userId);
        const session = await createStripeCheckout(runtime.stripe, {
          priceId: price.stripePriceId,
          planName: plan.name,
          workspaceId: data.workspaceId,
          planKey: data.planKey,
          cycle: data.cycle,
          successUrl: `${origin}/billing?checkout=success`,
          cancelUrl: `${origin}/billing?checkout=cancelled`,
          email,
        });
        if (!session.url) throw new Error("Stripe did not return a checkout URL.");
        url = session.url;
        providerSessionId = session.id;
      } else {
        const planId = await ensurePaypalPlan(runtime.paypal, {
          planKey: data.planKey,
          cycle: data.cycle as BillingCycle,
          planName: plan.name,
          amountUsd,
        });
        const subscription = await createPaypalSubscription(runtime.paypal, {
          planId,
          customId: `${data.workspaceId}:${data.planKey}:${data.cycle}`,
          origin,
        });
        if (!subscription.approveUrl) throw new Error("PayPal did not return an approval URL.");
        url = subscription.approveUrl;
        providerSessionId = subscription.id;
      }

      await completeCheckoutIntent(claim.intentId, url, providerSessionId);
      const { auditEvent } = await import("@/lib/audit.server");
      await auditEvent({
        actorId: ctx.userId,
        action: "checkout.start",
        entity: "checkout_intents",
        entityId: claim.intentId,
        workspaceId: data.workspaceId,
        metadata: {
          provider: data.provider,
          planKey: data.planKey,
          cycle: data.cycle,
          amountUsd,
        },
      });
      return { url, provider: data.provider, replayed: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failCheckoutIntent(claim.intentId, message);
      await appendPaymentLedger({
        workspaceId: data.workspaceId,
        provider: data.provider,
        entryType: "checkout.failed",
        providerEventId: data.idempotencyKey,
        amountUsd,
        plan: data.planKey,
        billingCycle: data.cycle,
        status: "failed",
        metadata: { error: message.slice(0, 300) },
      });
      throw error;
    }
  });

/* ------------------------------------------------------------------ */
/* Manage                                                              */
/* ------------------------------------------------------------------ */

export const createBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { userId: string };
    if (!(await isWorkspaceMember(ctx.userId, data.workspaceId))) {
      throw new Error("You do not have access to this workspace.");
    }
    const subscription = await getBillingRecord(data.workspaceId);
    if (!subscription?.provider_customer_id || subscription.provider !== "stripe") {
      throw new Error("The billing portal is only available for Stripe subscriptions.");
    }
    const runtime = await loadPaymentRuntime();
    const origin = await resolveOrigin();
    const portal = await createStripePortal(
      runtime.stripe,
      subscription.provider_customer_id,
      `${origin}/billing`,
    );
    return { url: portal.url };
  });

export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ workspaceId: z.string().uuid(), reason: z.string().max(300).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { userId: string };
    if (!(await isWorkspaceMember(ctx.userId, data.workspaceId))) {
      throw new Error("You do not have access to this workspace.");
    }
    const subscription = await getBillingRecord(data.workspaceId);
    if (!subscription?.provider || !subscription.provider_subscription_id) {
      throw new Error("No active subscription to cancel.");
    }
    const runtime = await loadPaymentRuntime();
    const reason = data.reason?.trim() || "Cancelled from dashboard";
    const { auditEvent } = await import("@/lib/audit.server");
    const recordCancel = (atPeriodEnd: boolean) =>
      auditEvent({
        actorId: ctx.userId,
        action: "subscription.cancel",
        entity: "subscriptions",
        entityId: data.workspaceId,
        workspaceId: data.workspaceId,
        metadata: { provider: subscription.provider, atPeriodEnd, reason },
      });

    if (subscription.provider === "stripe") {
      await setStripeCancelAtPeriodEnd(runtime.stripe, subscription.provider_subscription_id, true);
    } else if (subscription.provider === "paypal") {
      const { cancelPaypalSubscription } = await import("@/lib/paypal.server");
      await cancelPaypalSubscription(runtime.paypal, subscription.provider_subscription_id, reason);
      await updateSubscriptionStatus(data.workspaceId, "canceled", {
        canceledAt: new Date().toISOString(),
      });
      await recordCancel(false);
      return { ok: true, atPeriodEnd: false };
    }

    await updateSubscriptionStatus(data.workspaceId, subscription.status, {
      cancelAtPeriodEnd: true,
    });
    await recordCancel(true);
    return { ok: true, atPeriodEnd: true };
  });

/** Reconciles a PayPal return by pulling the latest subscription state. */
export const syncPaypalSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { userId: string };
    if (!(await isWorkspaceMember(ctx.userId, data.workspaceId))) {
      throw new Error("You do not have access to this workspace.");
    }
    const subscription = await getBillingRecord(data.workspaceId);
    if (!subscription?.provider_subscription_id) return { ok: false };

    const runtime = await loadPaymentRuntime();
    const { getPaypalSubscription } = await import("@/lib/paypal.server");
    const detail = await getPaypalSubscription(
      runtime.paypal,
      subscription.provider_subscription_id,
    );
    const active = detail.status === "ACTIVE";
    const { applyPaidSubscription } = await import("@/lib/billing.server");
    if (active && detail.plan_id === subscription.provider_plan_id) {
      await applyPaidSubscription({
        workspaceId: data.workspaceId,
        provider: "paypal",
        planKey: subscription.plan as PlanKey,
        cycle: subscription.billing_cycle as BillingCycle,
        status: "active",
        providerCustomerId: subscription.provider_customer_id,
        providerSubscriptionId: subscription.provider_subscription_id,
        providerPlanId: subscription.provider_plan_id,
        currentPeriodEnd: detail.billing_info?.next_billing_time ?? null,
      });
    }
    return { ok: true, status: detail.status };
  });
