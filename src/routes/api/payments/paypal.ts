import { createFileRoute } from "@tanstack/react-router";

import {
  appendPaymentLedger,
  applyPaidSubscription,
  beginPaymentEvent,
  downgradeWorkspace,
  findWorkspaceByProviderSubscription,
  finishPaymentEvent,
  getBillingRecord,
  grantPlanCredits,
  updateSubscriptionStatus,
} from "@/lib/billing.server";
import { clientIpFromHeaders, userAgentFromHeaders } from "@/lib/logger.server";
import { recordSecurityEvent } from "@/lib/security-events.server";
import { parsePaypalCustomId } from "@/lib/paypal-custom-id";
import { loadPaymentRuntime } from "@/lib/platform-config.server";
import { verifyPaypalWebhook } from "@/lib/paypal.server";
import type { BillingCycle, PlanKey } from "@/lib/pricing";

type PaypalEvent = {
  id: string;
  event_type: string;
  resource: Record<string, unknown>;
};

/** Reads a PayPal `amount` object ({ total, currency_code }) as dollars. */
function paypalAmount(resource: Record<string, unknown>): {
  amount: number | null;
  currency: string;
} {
  const amount = resource["amount"] as
    { total?: string; currency_code?: string; currency?: string } | undefined;
  const total = amount?.total !== undefined ? Number(amount.total) : Number.NaN;
  return {
    amount: Number.isFinite(total) ? total : null,
    currency: (amount?.currency_code ?? amount?.currency ?? "usd").toLowerCase(),
  };
}

export const Route = createFileRoute("/api/payments/paypal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const runtime = await loadPaymentRuntime();
        if (!runtime.paypal.clientId || !runtime.paypal.webhookId) {
          return new Response("PayPal is not configured.", { status: 400 });
        }

        const raw = await request.text();
        const valid = await verifyPaypalWebhook(runtime.paypal, request.headers, raw);
        if (!valid) {
          await recordSecurityEvent("webhook_signature_invalid", {
            provider: "paypal",
            path: "/api/payments/paypal",
            ip: clientIpFromHeaders(request.headers),
            ua: userAgentFromHeaders(request.headers),
          });
          return new Response("Invalid signature.", { status: 400 });
        }

        let event: PaypalEvent;
        try {
          event = JSON.parse(raw) as PaypalEvent;
        } catch {
          return new Response("Invalid payload.", { status: 400 });
        }

        const resource = event.resource ?? {};
        const parsed = parsePaypalCustomId(resource["custom_id"]);
        let workspaceId: string | null = parsed?.workspaceId ?? null;
        if (!workspaceId) {
          const subId =
            (resource["id"] as string | undefined) ??
            (resource["billing_agreement_id"] as string | undefined);
          if (subId) workspaceId = await findWorkspaceByProviderSubscription("paypal", subId);
        }

        const claim = await beginPaymentEvent({
          provider: "paypal",
          eventId: event.id,
          type: event.event_type,
          workspaceId,
          payload: event,
        });
        if (claim === "skip") return new Response("ok", { status: 200 });

        try {
          await handleEvent(event, resource, parsed, workspaceId);
          await finishPaymentEvent("paypal", event.id, { ok: true });
        } catch (error) {
          console.error("[paypal webhook] handler failed:", error);
          const message = error instanceof Error ? error.message : String(error);
          await finishPaymentEvent("paypal", event.id, { ok: false, error: message });
          return new Response("Handler error.", { status: 500 });
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});

async function handleEvent(
  event: PaypalEvent,
  resource: Record<string, unknown>,
  parsed: { workspaceId: string; planKey: PlanKey; cycle: BillingCycle } | null,
  workspaceId: string | null,
): Promise<void> {
  const nextBillingTime = (resource["billing_info"] as { next_billing_time?: string } | undefined)
    ?.next_billing_time;

  switch (event.event_type) {
    case "BILLING.SUBSCRIPTION.ACTIVATED": {
      if (!parsed) return;
      await applyPaidSubscription({
        workspaceId: parsed.workspaceId,
        provider: "paypal",
        planKey: parsed.planKey,
        cycle: parsed.cycle,
        status: "active",
        providerSubscriptionId: resource["id"] as string,
        providerPlanId: resource["plan_id"] as string,
        currentPeriodEnd: nextBillingTime ?? null,
        providerEventId: event.id,
      });
      return;
    }

    case "BILLING.SUBSCRIPTION.UPDATED": {
      if (!workspaceId) return;
      await updateSubscriptionStatus(
        workspaceId,
        "active",
        { currentPeriodEnd: nextBillingTime ?? null },
        { provider: "paypal", entryType: "subscription.updated", providerEventId: event.id },
      );
      return;
    }

    case "BILLING.SUBSCRIPTION.SUSPENDED": {
      if (!workspaceId) return;
      await updateSubscriptionStatus(workspaceId, "past_due", undefined, {
        provider: "paypal",
        entryType: "subscription.past_due",
        providerEventId: event.id,
      });
      return;
    }

    case "BILLING.SUBSCRIPTION.CANCELLED": {
      if (!workspaceId) return;
      await updateSubscriptionStatus(
        workspaceId,
        "canceled",
        { canceledAt: new Date().toISOString() },
        { provider: "paypal", entryType: "subscription.canceled", providerEventId: event.id },
      );
      return;
    }

    case "BILLING.SUBSCRIPTION.EXPIRED": {
      if (!workspaceId) return;
      await downgradeWorkspace(workspaceId, "paypal subscription expired", {
        provider: "paypal",
        providerEventId: event.id,
      });
      return;
    }

    case "PAYMENT.SALE.COMPLETED": {
      const subId = resource["billing_agreement_id"] as string | undefined;
      if (!subId) return;
      const ws = workspaceId ?? (await findWorkspaceByProviderSubscription("paypal", subId));
      if (!ws) return;
      const { amount, currency } = paypalAmount(resource);
      await appendPaymentLedger({
        workspaceId: ws,
        provider: "paypal",
        entryType: "payment.captured",
        providerEventId: event.id,
        providerSubscriptionId: subId,
        amountUsd: amount,
        currency,
        status: "completed",
        metadata: { saleId: (resource["id"] as string | undefined) ?? null },
      });
      const record = await getBillingRecord(ws);
      if (!record) return;
      // The activation sale already granted credits; only grant when the stored
      // period has ended (a genuine renewal).
      const ended =
        !record.current_period_end || new Date(record.current_period_end).getTime() <= Date.now();
      if (ended && record.status === "active") {
        await grantPlanCredits(
          ws,
          record.plan as PlanKey,
          record.billing_cycle as BillingCycle,
          `paypal renewal ${record.plan}`,
        );
      }
      return;
    }

    case "PAYMENT.SALE.REFUNDED": {
      const subId = resource["billing_agreement_id"] as string | undefined;
      const ws =
        workspaceId ?? (subId ? await findWorkspaceByProviderSubscription("paypal", subId) : null);
      if (!ws) return;
      const { amount, currency } = paypalAmount(resource);
      await appendPaymentLedger({
        workspaceId: ws,
        provider: "paypal",
        entryType: "payment.refunded",
        providerEventId: event.id,
        providerSubscriptionId: subId ?? null,
        amountUsd: amount,
        currency,
        status: "refunded",
        metadata: { saleId: (resource["id"] as string | undefined) ?? null },
      });
      return;
    }

    default:
      return;
  }
}
