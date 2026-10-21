import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Eye, Heart, Timer, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatGridSkeleton } from "@/components/dashboard/Skeletons";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { generateInsights } from "@/lib/ai.functions";

export const Route = createFileRoute("/_dash/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Createtor" },
      {
        name: "description",
        content:
          "Views, watch time, retention and engagement, plus channel notes based on your own results.",
      },
      { property: "og:title", content: "Analytics — Createtor" },
      { property: "og:description", content: "Performance insights from your own data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Analytics,
});

function Analytics() {
  const { data: workspace } = useWorkspace();
  const [summary, setSummary] = useState("");
  const [insights, setInsights] = useState<{ observation: string; recommendation: string }[]>([]);

  const rows = useQuery({
    queryKey: ["analytics", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analytics")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("metric_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const totals = (rows.data ?? []).reduce(
    (acc, r) => ({
      views: acc.views + r.views,
      watch: acc.watch + r.watch_time_seconds,
      engagement: acc.engagement + r.likes + r.comments + r.shares,
      followers: acc.followers + r.followers_gained,
    }),
    { views: 0, watch: 0, engagement: 0, followers: 0 },
  );

  const analyse = useMutation({
    mutationFn: () =>
      generateInsights({
        data: {
          rows: (rows.data ?? []).slice(0, 100).map((r) => ({
            topic: null,
            hookType: null,
            platform: r.platform ?? null,
            durationSeconds: null,
            views: r.views,
            engagementRate:
              r.views > 0 ? ((r.likes + r.comments + r.shares) / r.views) * 100 : null,
            retentionPercent: r.retention_percent === null ? null : Number(r.retention_percent),
            postingTime: null,
          })),
        },
      }),
    onSuccess: (result) => {
      setSummary(result.summary);
      setInsights(result.insights);
      toast.success("Analysis complete");
    },
    onError: () => toast.error("The analysis could not be completed. Please try again."),
  });

  const hasData = (rows.data ?? []).length > 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Real numbers only — metrics appear once published videos start reporting back."
        actions={
          <Button onClick={() => analyse.mutate()} disabled={!hasData || analyse.isPending}>
            <BarChart3 className="mr-1.5 size-4" />
            {analyse.isPending ? "Analysing…" : "Analyse channel data"}
          </Button>
        }
      />

      {rows.isLoading ? (
        <StatGridSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Views" value={totals.views.toLocaleString()} icon={Eye} />
          <StatCard
            label="Watch time"
            value={`${Math.round(totals.watch / 60).toLocaleString()} min`}
            icon={Timer}
          />
          <StatCard label="Engagements" value={totals.engagement.toLocaleString()} icon={Heart} />
          <StatCard
            label="New followers"
            value={totals.followers.toLocaleString()}
            icon={UserPlus}
          />
        </div>
      )}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Channel analysis</CardTitle>
          <CardDescription>
            Patterns come from your own published results. Nothing here predicts or promises
            virality.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasData && (
            <p className="text-sm text-muted-foreground">
              There is no performance data yet, so there is nothing honest to analyse. Publish a few
              videos first.
            </p>
          )}
          {summary && <p className="text-sm">{summary}</p>}
          {insights.map((i) => (
            <div key={i.observation} className="rounded-lg border border-border px-3 py-3">
              <p className="text-sm font-medium">{i.observation}</p>
              <p className="mt-1 text-sm text-muted-foreground">{i.recommendation}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
