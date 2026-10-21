import { createFileRoute } from "@tanstack/react-router";

import {
  appendPaymentLedger,
  applyPaidSubscription,
  beginPaymentEvent,
  downgradeWorkspace,
  findWorkspaceByProviderCustomer,
  findWorkspaceByProviderSubscription,
  finishPaymentEvent,
  getBillingRecord,
  grantPlanCredits,
  updateSubscriptionStatus,
} from "@/lib/billing.server";
import { clientIpFromHeaders, userAgentFromHeaders } from "@/lib/logger.server";
import { recordSecurityEvent } from "@/lib/security-events.server";
import { loadPaymentRuntime } from "@/lib/platform-config.server";
import { retrieveStripeSubscription, verifyStripeWebhook } from "@/lib/stripe.server";
import type { BillingCycle, PlanKey } from "@/lib/pricing";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

function isoFromUnix(value: unknown): string | null {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

/** Converts a Stripe minor-unit amount (cents) to dollars. */
function usd(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n / 100 : null;
}

export const Route = createFileRoute("/api/payments/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const runtime = await loadPaymentRuntime();
        if (!runtime.stripe.secretKey || !runtime.stripe.webhookSecret) {
          return new Response("Stripe is not configured.", { status: 400 });
        }

        const raw = await request.text();
        const valid = await verifyStripeWebhook(
          runtime.stripe.webhookSecret,
          request.headers.get("stripe-signature"),
          raw,
        );
        if (!valid) {
          await recordSecurityEvent("webhook_signature_invalid", {
            provider: "stripe",
            path: "/api/payments/stripe",
            ip: clientIpFromHeaders(request.headers),
            ua: userAgentFromHeaders(request.headers),
          });
          return new Response("Invalid signature.", { status: 400 });
        }

        let event: StripeEvent;
        try {
          event = JSON.parse(raw) as StripeEvent;
        } catch {
          return new Response("Invalid payload.", { status: 400 });
        }

        const object = event.data.object;
        const metadata = (object["metadata"] ?? {}) as Record<string, string>;

        let workspaceId: string | null = null;
        if (event.type === "checkout.session.completed") {
          workspaceId =
            metadata["workspaceId"] ??
            (object["client_reference_id"] as string | undefined) ??
            null;
        } else if (
          event.type.startsWith("customer.subscription.") ||
          event.type === "invoice.paid"
        ) {
          const subId =
            (object["id"] as string | undefined) ?? (object["subscription"] as string | undefined);
          if (subId) workspaceId = await findWorkspaceByProviderSubscription("stripe", subId);
        } else if (event.type === "invoice.payment_failed" || event.type === "charge.refunded") {
          const customer = object["customer"] as string | undefined;
          if (customer) workspaceId = await findWorkspaceByProviderCustomer("stripe", customer);
        }

        const claim = await beginPaymentEvent({
          provider: "stripe",
          eventId: event.id,
          type: event.type,
          workspaceId,
          payload: event,
        });
        if (claim === "skip") return new Response("ok", { status: 200 });

        try {
          await handleEvent(event, object, metadata, workspaceId);
          await finishPaymentEvent("stripe", event.id, { ok: true });
        } catch (error) {
          console.error("[stripe webhook] handler failed:", error);
          const message = error instanceof Error ? error.message : String(error);
          await finishPaymentEvent("stripe", event.id, { ok: false, error: message });
          return new Response("Handler error.", { status: 500 });
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});

async function handleEvent(
  event: StripeEvent,
  object: Record<string, unknown>,
  metadata: Record<string, string>,
  workspaceId: string | null,
): Promise<void> {
  const runtime = await loadPaymentRuntime();

  switch (event.type) {
    case "checkout.session.completed": {
      if (!workspaceId) return;
      const planKey = metadata["planKey"] as PlanKey | undefined;
      const cycle = (metadata["cycle"] as BillingCycle | undefined) ?? "monthly";
      const subscriptionId = object["subscription"] as string | undefined;
      if (!planKey || !subscriptionId) return;

      const subscription = await retrieveStripeSubscription(runtime.stripe, subscriptionId);
      await applyPaidSubscription({
        workspaceId,
        provider: "stripe",
        planKey,
        cycle,
        status: subscription.status,
        providerCustomerId: subscription.customer,
        providerSubscriptionId: subscription.id,
        currentPeriodEnd: isoFromUnix(subscription.current_period_end),
        providerEventId: event.id,
        // Amount Stripe actually charged for the session (falls back to DB pricing).
        amountUsd: usd(object["amount_total"]),
      });
      return;
    }

    case "customer.subscription.updated": {
      if (!workspaceId) return;
      await updateSubscriptionStatus(
        workspaceId,
        object["status"] as string,
        {
          currentPeriodEnd: isoFromUnix(object["current_period_end"]),
          cancelAtPeriodEnd: Boolean(object["cancel_at_period_end"]),
        },
        { provider: "stripe", entryType: "subscription.updated", providerEventId: event.id },
      );
      return;
    }

    case "customer.subscription.deleted": {
      if (!workspaceId) return;
      await downgradeWorkspace(workspaceId, "stripe subscription ended", {
        provider: "stripe",
        providerEventId: event.id,
      });
      return;
    }

    case "invoice.payment_failed": {
      if (!workspaceId) return;
      await updateSubscriptionStatus(workspaceId, "past_due", undefined, {
        provider: "stripe",
        entryType: "subscription.past_due",
        providerEventId: event.id,
      });
      await appendPaymentLedger({
        workspaceId,
        provider: "stripe",
        entryType: "payment.failed",
        providerEventId: event.id,
        providerSubscriptionId: (object["subscription"] as string | undefined) ?? null,
        providerCustomerId: (object["customer"] as string | undefined) ?? null,
        amountUsd: usd(object["amount_due"]),
        currency: (object["currency"] as string | undefined) ?? "usd",
        status: "failed",
        metadata: { invoiceId: (object["id"] as string | undefined) ?? null },
      });
      return;
    }

    case "invoice.paid": {
      if (!workspaceId) return;
      await appendPaymentLedger({
        workspaceId,
        provider: "stripe",
        entryType: "payment.captured",
        providerEventId: event.id,
        providerSubscriptionId: (object["subscription"] as string | undefined) ?? null,
        providerCustomerId: (object["customer"] as string | undefined) ?? null,
        amountUsd: usd(object["amount_paid"]),
        currency: (object["currency"] as string | undefined) ?? "usd",
        status: "paid",
        metadata: {
          invoiceId: (object["id"] as string | undefined) ?? null,
          billingReason: (object["billing_reason"] as string | undefined) ?? null,
        },
      });
      // The first invoice is created alongside the subscription; the checkout
      // handler already granted those credits. Only renewals grant again.
      if (object["billing_reason"] === "subscription_create") return;
      const record = await getBillingRecord(workspaceId);
      if (!record) return;
      await grantPlanCredits(
        workspaceId,
        record.plan as PlanKey,
        record.billing_cycle as BillingCycle,
        `stripe renewal ${record.plan}`,
      );
      return;
    }

    case "charge.refunded": {
      if (!workspaceId) return;
      await appendPaymentLedger({
        workspaceId,
        provider: "stripe",
        entryType: "payment.refunded",
        providerEventId: event.id,
        providerSubscriptionId: (object["subscription"] as string | undefined) ?? null,
        providerCustomerId: (object["customer"] as string | undefined) ?? null,
        amountUsd: usd(object["amount_refunded"] ?? object["amount"]),
        currency: (object["currency"] as string | undefined) ?? "usd",
        status: "refunded",
        metadata: { chargeId: (object["id"] as string | undefined) ?? null },
      });
      return;
    }

    default:
      return;
  }
}
