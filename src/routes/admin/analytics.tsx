import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Coins, Eye, Film, Send, Users } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminAnalytics, getProductAnalytics } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/analytics")({
  component: AdminAnalytics,
});

type Point = {
  date: string;
  signups: number;
  projects: number;
  jobs: number;
  published: number;
  consumed: number;
};

function Sparkline({
  data,
  field,
  tone,
}: {
  data: Point[];
  field: keyof Omit<Point, "date">;
  tone: string;
}) {
  const max = Math.max(1, ...data.map((d) => d[field]));
  return (
    <div className="flex h-24 items-end gap-[3px]">
      {data.map((d) => (
        <div
          key={d.date}
          className="group relative min-w-0 flex-1 rounded-t"
          style={{ height: `${Math.max(3, (d[field] / max) * 100)}%`, background: tone }}
          title={`${d.date}: ${d[field]}`}
        />
      ))}
    </div>
  );
}

function AdminAnalytics() {
  const analytics = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => getAdminAnalytics({ data: { days: 30 } }),
  });

  const product = useQuery({
    queryKey: ["admin-product-analytics"],
    queryFn: () => getProductAnalytics({ data: { days: 30 } }),
  });

  const totals = analytics.data?.series.reduce(
    (acc, d) => {
      acc.signups += d.signups;
      acc.projects += d.projects;
      acc.jobs += d.jobs;
      acc.published += d.published;
      acc.consumed += d.consumed;
      return acc;
    },
    { signups: 0, projects: 0, jobs: 0, published: 0, consumed: 0 },
  );

  return (
    <>
      <PageHeader
        title="Platform analytics"
        description="Signups, generation volume and engagement across the last 30 days."
      />

      {analytics.isLoading || !analytics.data || !totals ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="New signups" value={totals.signups} icon={Users} hint="last 30 days" />
            <StatCard
              label="New projects"
              value={totals.projects}
              icon={Film}
              hint="last 30 days"
            />
            <StatCard label="Generations" value={totals.jobs} icon={Film} hint="last 30 days" />
            <StatCard label="Published" value={totals.published} icon={Send} hint="last 30 days" />
            <StatCard
              label="Credits consumed"
              value={totals.consumed.toLocaleString()}
              icon={Coins}
              hint="last 30 days"
            />
          </div>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-lg">Daily activity</CardTitle>
              <CardDescription>Signups and generations per day over the window.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Signups
                </p>
                <Sparkline
                  data={analytics.data.series}
                  field="signups"
                  tone="var(--color-chart-2)"
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Generations
                </p>
                <Sparkline data={analytics.data.series} field="jobs" tone="var(--color-primary)" />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Credits consumed
                </p>
                <Sparkline
                  data={analytics.data.series}
                  field="consumed"
                  tone="var(--color-brand-tertiary)"
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-lg">Plan distribution</CardTitle>
                <CardDescription>Workspaces per plan.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analytics.data.planDistribution.map((p) => {
                  const total =
                    analytics.data.planDistribution.reduce((n, x) => n + x.count, 0) || 1;
                  return (
                    <div key={p.key} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{p.plan}</span>
                        <span className="text-muted-foreground">{p.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((p.count / total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-lg">Engagement</CardTitle>
                <CardDescription>Aggregated published-post metrics.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Eye className="size-4" />
                    <span className="text-xs uppercase tracking-wide">Total views</span>
                  </div>
                  <p className="mt-2 font-display text-2xl font-semibold">
                    {analytics.data.platformViews.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Film className="size-4" />
                    <span className="text-xs uppercase tracking-wide">Watch time</span>
                  </div>
                  <p className="mt-2 font-display text-2xl font-semibold">
                    {Math.round(analytics.data.platformWatchTime / 3600).toLocaleString()}h
                  </p>
                </div>
                <div className="col-span-2 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Generation jobs by status
                  </p>
                  {analytics.data.jobStatus.length === 0 && (
                    <p className="text-sm text-muted-foreground">No jobs yet.</p>
                  )}
                  {analytics.data.jobStatus.map((s) => (
                    <div key={s.status} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{s.status}</span>
                      <span className="text-muted-foreground">{s.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Product analytics</CardTitle>
          <CardDescription>
            In-app events captured over the last 30 days
            {product.data ? ` · ${product.data.total.toLocaleString()} total` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {product.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : product.isError || !product.data ? (
            <p className="text-sm text-destructive">
              {product.error instanceof Error
                ? product.error.message
                : "Failed to load product analytics."}
            </p>
          ) : product.data.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Event
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Count
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Workspaces
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {product.data.events.slice(0, 20).map((e) => (
                    <tr key={e.event}>
                      <td className="py-2 pr-4 font-mono text-xs">{e.event}</td>
                      <td className="py-2 pr-4">{e.count.toLocaleString()}</td>
                      <td className="py-2 text-muted-foreground">{e.workspaces}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
