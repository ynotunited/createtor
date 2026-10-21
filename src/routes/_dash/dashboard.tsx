import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CalendarClock,
  Clock,
  Eye,
  Film,
  Heart,
  Plus,
  Send,
  UserPlus,
} from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ListSkeleton, StatGridSkeleton } from "@/components/dashboard/Skeletons";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_dash/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Createtor" },
      {
        name: "description",
        content: "Your channel pipeline at a glance: renders, schedule, performance and queue.",
      },
      { property: "og:title", content: "Dashboard — Createtor" },
      { property: "og:description", content: "Your channel production pipeline overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-overview", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const [projects, scheduled, published, analytics, jobs, autopilot, credits] =
        await Promise.all([
          supabase
            .from("projects")
            .select("id,title,status,updated_at", { count: "exact" })
            .eq("workspace_id", workspaceId!)
            .order("updated_at", { ascending: false })
            .limit(5),
          supabase
            .from("scheduled_posts")
            .select("id,platform,scheduled_for,status")
            .eq("workspace_id", workspaceId!)
            .order("scheduled_for", { ascending: true })
            .limit(5),
          supabase
            .from("published_posts")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId!),
          supabase
            .from("analytics")
            .select("views,watch_time_seconds,likes,comments,shares,followers_gained")
            .eq("workspace_id", workspaceId!)
            .limit(2000),
          supabase
            .from("video_jobs")
            .select("id,kind,status,progress")
            .eq("workspace_id", workspaceId!)
            .in("status", ["queued", "processing", "generating", "rendering"])
            .limit(5),
          supabase
            .from("autopilot_configs")
            .select("enabled,mode,videos_per_week")
            .eq("workspace_id", workspaceId!)
            .maybeSingle(),
          supabase
            .from("usage_credits")
            .select("balance,reserved")
            .eq("workspace_id", workspaceId!)
            .maybeSingle(),
        ]);

      const totals = (analytics.data ?? []).reduce(
        (acc, row) => ({
          views: acc.views + row.views,
          watch: acc.watch + row.watch_time_seconds,
          engagement: acc.engagement + row.likes + row.comments + row.shares,
          followers: acc.followers + row.followers_gained,
        }),
        { views: 0, watch: 0, engagement: 0, followers: 0 },
      );

      return {
        projects: projects.data ?? [],
        projectCount: projects.count ?? projects.data?.length ?? 0,
        scheduled: scheduled.data ?? [],
        publishedCount: published.count ?? 0,
        totals,
        jobs: jobs.data ?? [],
        autopilot: autopilot.data,
        credits: credits.data,
      };
    },
  });

  const totals = data?.totals ?? { views: 0, watch: 0, engagement: 0, followers: 0 };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Track the daily channel queue, drafts, renders, scheduled posts and performance from one workspace."
        actions={
          <>
            <Button asChild>
              <Link to="/create-video">
                <Plus className="mr-1.5 size-4" /> Create video
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/autopilot">
                <CalendarDays className="mr-1.5 size-4" /> Daily queue
              </Link>
            </Button>
          </>
        }
      />

      {isLoading ? (
        <StatGridSkeleton count={8} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Projects" value={data?.projectCount ?? 0} icon={Film} />
          <StatCard label="Scheduled" value={data?.scheduled.length ?? 0} icon={CalendarClock} />
          <StatCard label="Published" value={data?.publishedCount ?? 0} icon={Send} />
          <StatCard
            label="Total views"
            value={totals.views.toLocaleString()}
            hint="From connected platforms"
            icon={Eye}
          />
          <StatCard label="Watch time" value={`${Math.round(totals.watch / 3600)}h`} icon={Clock} />
          <StatCard label="Engagement" value={totals.engagement.toLocaleString()} icon={Heart} />
          <StatCard
            label="Followers gained"
            value={totals.followers.toLocaleString()}
            icon={UserPlus}
          />
          <StatCard
            label="Credits available"
            value={data?.credits?.balance ?? 0}
            hint={`${data?.credits?.reserved ?? 0} reserved`}
            icon={Activity}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-panel lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Recent projects</CardTitle>
            <CardDescription>
              Your latest videos and where they are in the pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <ListSkeleton rows={3} />
            ) : data?.projects.length ? (
              data.projects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm">{project.title}</span>
                  <Badge variant="secondary">{project.status.replace(/_/g, " ")}</Badge>
                </div>
              ))
            ) : (
              <EmptyState
                icon={Film}
                title="No projects yet"
                description="Start with a topic idea, then build the script and storyboard."
              />
            )}
            <Button asChild variant="secondary" className="mt-2">
              <Link to="/ai-ideas">Find topic ideas</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Rendering jobs</CardTitle>
            <CardDescription>Long-running work runs in the background.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <ListSkeleton rows={3} />
            ) : data?.jobs.length ? (
              data.jobs.map((job) => (
                <div key={job.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize">{job.kind.replace(/_/g, " ")}</span>
                    <span className="text-xs text-muted-foreground">{job.status}</span>
                  </div>
                  <Progress value={job.progress} />
                </div>
              ))
            ) : (
              <EmptyState
                icon={Clock}
                title="Nothing rendering"
                description="Long-running renders appear here with live progress."
              />
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Daily queue</CardTitle>
            <CardDescription>
              {data?.autopilot?.enabled
                ? `Running in ${data.autopilot.mode} mode · ${data.autopilot.videos_per_week} videos/week`
                : "Not configured yet."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary">
              <Link to="/autopilot">Configure queue</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Channel recommendations</CardTitle>
            <CardDescription>
              Recommendations are generated from your own published performance data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Once videos are published and analytics are collected, the analysis panel will
              highlight what is working for your channel — hooks, lengths, posting times and topics.
            </p>
            <Button asChild variant="secondary">
              <Link to="/analytics">
                <BarChart3 className="mr-1.5 size-4" /> Open analytics
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
