import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, DollarSign, Users } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listBilling } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/billing")({
  component: AdminBilling,
});

function AdminBilling() {
  const billing = useQuery({ queryKey: ["admin-billing"], queryFn: () => listBilling() });

  return (
    <>
      <PageHeader
        title="Billing & plans"
        description="Plan mix, revenue estimate and subscription state across Stripe and PayPal. MRR is estimated from plan prices."
      />

      {billing.isLoading || !billing.data ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : billing.isError ? (
        <Card className="glass-panel">
          <CardContent className="py-6 text-sm text-destructive">
            {billing.error instanceof Error ? billing.error.message : "Failed to load billing."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Estimated MRR"
              value={`$${billing.data.mrr.toLocaleString()}`}
              icon={DollarSign}
            />
            <StatCard
              label="Paying workspaces"
              value={billing.data.payingWorkspaces}
              icon={Users}
            />
            <StatCard
              label="Subscriptions"
              value={billing.data.subscriptions.length}
              icon={CreditCard}
            />
          </div>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-lg">Plan mix</CardTitle>
              <CardDescription>Workspace count and monthly price per plan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {billing.data.distribution.map((p) => (
                <div key={p.key} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground">${p.price}/mo</span>
                  </div>
                  <span className="text-muted-foreground">
                    {p.count} workspace{p.count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-lg">Subscriptions</CardTitle>
              <CardDescription>Active subscription records.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {billing.data.subscriptions.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">
                  No subscription records yet. Paid plans created through Stripe or PayPal will
                  appear here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Workspace
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Plan
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Status
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Provider
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Renews
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {billing.data.subscriptions.map((s) => (
                        <tr key={s.id}>
                          <td className="px-5 py-3 font-medium">{s.workspaceName}</td>
                          <td className="px-5 py-3 capitalize text-muted-foreground">
                            {s.plan}
                            <span className="ml-1 text-xs">({s.billingCycle})</span>
                          </td>
                          <td className="px-5 py-3">
                            <Badge variant="secondary">{s.status}</Badge>
                            {s.cancelAtPeriodEnd && (
                              <span className="ml-2 text-xs text-muted-foreground">cancels</span>
                            )}
                          </td>
                          <td className="px-5 py-3 capitalize text-muted-foreground">
                            {s.provider ?? (s.linked ? "linked" : "-")}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                            {s.currentPeriodEnd
                              ? new Date(s.currentPeriodEnd).toLocaleDateString()
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
