import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Coins, Film, LayoutDashboard, Send, TrendingUp, Users } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getOverview, listAuditLogs, listWorkspaces } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => getOverview() });
  const workspaces = useQuery({
    queryKey: ["admin-workspaces", "recent"],
    queryFn: () => listWorkspaces({ data: { limit: 5 } }),
  });
  const audit = useQuery({
    queryKey: ["admin-audit", "recent"],
    queryFn: () => listAuditLogs({ data: { limit: 6 } }),
  });

  const maxPlan = workspaces.data
    ? Object.entries(
        workspaces.data.reduce<Record<string, number>>((acc, w) => {
          acc[w.plan] = (acc[w.plan] ?? 0) + 1;
          return acc;
        }, {}),
      )
    : [];
  const planTotal = maxPlan.reduce((n, [, count]) => n + count, 0) || 1;

  return (
    <>
      <PageHeader
        title="Admin overview"
        description="Platform-wide health across users, workspaces, generation and publishing."
      />

      {overview.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : overview.isError || !overview.data ? (
        <Card className="glass-panel">
          <CardContent className="py-6 text-sm text-destructive">
            {overview.error instanceof Error ? overview.error.message : "Failed to load overview."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Users"
            value={overview.data.users}
            icon={Users}
            hint={`${overview.data.newUsers} new this week`}
          />
          <StatCard label="Workspaces" value={overview.data.workspaces} icon={Building2} />
          <StatCard label="Projects" value={overview.data.projects} icon={Film} />
          <StatCard label="Published posts" value={overview.data.published} icon={Send} />
          <StatCard label="Credits in wallets" value={overview.data.credits.balance} icon={Coins} />
          <StatCard
            label="Credits consumed"
            value={overview.data.credits.consumed}
            icon={TrendingUp}
          />
          <StatCard
            label="Credits reserved"
            value={overview.data.credits.reserved}
            icon={LayoutDashboard}
          />
          <StatCard label="Video jobs" value={overview.data.jobs} icon={Film} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Plan distribution</CardTitle>
            <CardDescription>Workspaces by subscription tier.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {maxPlan.length === 0 && (
              <p className="text-sm text-muted-foreground">No workspaces yet.</p>
            )}
            {maxPlan.map(([plan, count]) => (
              <div key={plan} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{plan}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((count / planTotal) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Recent admin activity</CardTitle>
            <CardDescription>Latest privileged actions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {audit.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            )}
            {audit.data?.map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between gap-3 border-b border-border pb-3 text-sm last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-medium capitalize">{log.action.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">{log.entity ?? "system"}</p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()}
                </time>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
