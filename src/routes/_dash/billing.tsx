import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Coins, Gauge } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatGridSkeleton } from "@/components/dashboard/Skeletons";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { trackClient } from "@/lib/analytics-client";
import {
  cancelMySubscription,
  createBillingPortal,
  createCheckoutSession,
  getBillingState,
  getPricing,
  syncPaypalSubscription,
} from "@/lib/payments.functions";
import { CREDIT_COSTS, PLANS, type BillingCycle, type PlanKey } from "@/lib/pricing";

export const Route = createFileRoute("/_dash/billing")({
  validateSearch: (search: Record<string, unknown>): { checkout?: string } => {
    const checkout =
      typeof search["checkout"] === "string" ? (search["checkout"] as string) : undefined;
    return checkout ? { checkout } : {};
  },
  head: () => ({
    meta: [
      { title: "Billing & Credits — Createtor" },
      {
        name: "description",
        content:
          "Your plan, credit balance and what each generation costs. Failed generations are always refunded.",
      },
      { property: "og:title", content: "Billing & Credits — Createtor" },
      { property: "og:description", content: "Plans, credits and usage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Billing,
});

type PaidPlanKey = "creator" | "pro" | "agency";

function Billing() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const reconciled = useRef(false);
  const checkoutKeyRef = useRef<{ sig: string; key: string } | null>(null);

  const credits = useQuery({
    queryKey: ["credits", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_credits")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const billing = useQuery({
    queryKey: ["billing", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: () => getBillingState({ data: { workspaceId: workspace!.id } }),
  });

  // Display prices come from the server (database), so the shown amount always
  // matches what checkout charges. `PLANS` only supplies copy (name, features).
  const pricing = useQuery({
    queryKey: ["pricing"],
    queryFn: () => getPricing(),
    staleTime: 5 * 60_000,
  });

  const subscription = billing.data?.subscription ?? null;
  const availability = billing.data?.availability ?? { stripe: false, paypal: false };
  const currentPlan = (subscription?.plan ?? "free") as PlanKey;

  useEffect(() => {
    const checkoutParam = search.checkout;
    if (checkoutParam === "success") {
      toast.success("Subscription updated");
      void queryClient.invalidateQueries({ queryKey: ["billing", workspace?.id] });
      void queryClient.invalidateQueries({ queryKey: ["credits", workspace?.id] });
      if (workspace?.id && !reconciled.current) {
        reconciled.current = true;
        syncPaypalSubscription({ data: { workspaceId: workspace.id } }).catch(() => undefined);
      }
    } else if (checkoutParam === "cancelled") {
      toast("Checkout cancelled");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.checkout]);

  const checkout = useMutation({
    mutationFn: (vars: { planKey: PaidPlanKey; provider: "stripe" | "paypal" }) => {
      // One idempotency key per (plan, provider, cycle) attempt. Retrying after a
      // network timeout reuses the key, so the server replays the cached session
      // instead of creating a second (duplicate-charge) checkout.
      const sig = `${vars.planKey}:${vars.provider}:${cycle}`;
      if (checkoutKeyRef.current?.sig !== sig) {
        checkoutKeyRef.current = { sig, key: crypto.randomUUID() };
      }
      return createCheckoutSession({
        data: {
          workspaceId: workspace!.id,
          planKey: vars.planKey,
          cycle,
          provider: vars.provider,
          idempotencyKey: checkoutKeyRef.current.key,
        },
      });
    },
    onSuccess: (result, vars) => {
      trackClient(
        "billing.checkout_started",
        { plan: vars.planKey, provider: vars.provider, cycle },
        workspace?.id,
      );
      window.location.href = result.url;
    },
    onError: (error) => toast.error(toUserMessage(error, "Checkout failed")),
  });

  const portal = useMutation({
    mutationFn: () => createBillingPortal({ data: { workspaceId: workspace!.id } }),
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (error) => toast.error(toUserMessage(error, "Could not open portal")),
  });

  const cancelSub = useMutation({
    mutationFn: () => cancelMySubscription({ data: { workspaceId: workspace!.id } }),
    onSuccess: (result) => {
      toast.success(
        result.atPeriodEnd ? "Cancels at the end of the period" : "Subscription cancelled",
      );
      void queryClient.invalidateQueries({ queryKey: ["billing", workspace?.id] });
    },
    onError: (error) => toast.error(toUserMessage(error, "Cancel failed")),
  });

  const paymentsAvailable = availability.stripe || availability.paypal;
  const busy = checkout.isPending;

  return (
    <>
      <PageHeader
        title="Billing & Credits"
        description="Credits are reserved before an expensive generation runs and refunded in full if it fails."
      />

      {credits.isLoading ? (
        <StatGridSkeleton count={3} className="sm:grid-cols-3 xl:grid-cols-3" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Credit balance"
            value={credits.data?.balance ?? 0}
            icon={Coins}
            hint={`${credits.data?.reserved ?? 0} reserved`}
          />
          <StatCard
            label="Lifetime used"
            value={credits.data?.lifetime_consumed ?? 0}
            icon={Gauge}
          />
          <StatCard label="Current plan" value={currentPlan.toUpperCase()} icon={Check} />
        </div>
      )}

      {subscription && currentPlan !== "free" && (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Subscription</CardTitle>
            <CardDescription>
              {subscription.provider === "stripe" ? "Stripe" : "PayPal"} · {subscription.status}
              {subscription.currentPeriodEnd
                ? ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                : ""}
              {subscription.cancelAtPeriodEnd ? " · cancels at period end" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {subscription.provider === "stripe" && (
              <Button variant="outline" disabled={portal.isPending} onClick={() => portal.mutate()}>
                Manage billing
              </Button>
            )}
            {!subscription.cancelAtPeriodEnd && (
              <Button
                variant="ghost"
                disabled={cancelSub.isPending}
                onClick={() => cancelSub.mutate()}
              >
                Cancel subscription
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="glass-panel">
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Plans</CardTitle>
            <CardDescription>
              Yearly billing saves two months. Checkout is handled securely by Stripe or PayPal.
            </CardDescription>
          </div>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(["monthly", "yearly"] as BillingCycle[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={`rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                  cycle === c
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const cyclePricing = pricing.data?.[plan.key]?.[cycle];
            const price = cyclePricing ? cyclePricing.amountCents / 100 : null;
            const checkoutAvailable = cyclePricing?.checkoutAvailable ?? false;
            const isCurrent = plan.key === currentPlan;
            return (
              <div key={plan.key} className="flex flex-col rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-lg font-semibold">{plan.name}</p>
                  {isCurrent && <Badge>Current</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="mt-3 font-display text-xl">
                  {plan.key === "free" || price === 0
                    ? "Free"
                    : price === null
                      ? "—"
                      : `$${price.toLocaleString()}`}
                  {price !== null && price > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /{cycle === "yearly" ? "yr" : "mo"}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.monthlyCredits.toLocaleString()} credits · {plan.storageGb} GB storage
                </p>
                <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.key === "free" ? (
                  <Button variant="secondary" className="mt-4" disabled>
                    {isCurrent ? "Active" : "Included"}
                  </Button>
                ) : isCurrent ? (
                  <Button variant="secondary" className="mt-4" disabled>
                    Current plan
                  </Button>
                ) : !checkoutAvailable ? (
                  <Button variant="secondary" className="mt-4" disabled>
                    Coming soon
                  </Button>
                ) : paymentsAvailable ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {availability.stripe && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          checkout.mutate({ planKey: plan.key as PaidPlanKey, provider: "stripe" })
                        }
                      >
                        Pay with Stripe
                      </Button>
                    )}
                    {availability.paypal && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          checkout.mutate({ planKey: plan.key as PaidPlanKey, provider: "paypal" })
                        }
                      >
                        PayPal
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button variant="secondary" className="mt-4" disabled>
                    Payments unavailable
                  </Button>
                )}

                {plan.key !== "free" && price !== null && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {cycle === "yearly"
                      ? `Auto-renews yearly at $${price.toLocaleString()} until cancelled.`
                      : `Auto-renews monthly at $${price.toLocaleString()} until cancelled.`}{" "}
                    Cancel anytime under Manage billing (Stripe) or by contacting support (PayPal);
                    access continues to the end of the paid period.
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
        <div className="px-6 pb-6">
          <p className="text-xs text-muted-foreground">
            Paid plans renew automatically at the price shown until you cancel. You can cancel from
            Manage billing (Stripe) or by contacting support (PayPal), and you keep access until the
            end of the period you have already paid for. See our{" "}
            <Link to="/refunds" className="text-foreground underline underline-offset-2">
              Refund Policy
            </Link>
            .
          </p>
        </div>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Credit costs</CardTitle>
          <CardDescription>
            You see the estimated cost before any of these actions runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(CREDIT_COSTS).map(([key, cost]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="capitalize">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
              <Badge variant="outline">{cost} credits</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
