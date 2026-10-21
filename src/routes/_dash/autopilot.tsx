import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { saveAutopilotConfig } from "@/lib/autopilot.functions";
import { PLANS } from "@/lib/pricing";
import {
  detectTimeZone,
  formatInTimeZone,
  isValidTimeZone,
  listTimeZones,
  nextRuns,
} from "@/lib/schedule";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_dash/autopilot")({
  head: () => ({
    meta: [
      { title: "Daily Queue — Createtor" },
      {
        name: "description",
        content:
          "Set the niche, cadence and approval mode, then let the pipeline research, create and publish on schedule.",
      },
      { property: "og:title", content: "Daily Queue — Createtor" },
      { property: "og:description", content: "Hands-off content production." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DailyQueue,
});

type Platform = Database["public"]["Enums"]["platform"];

const PLATFORMS: Platform[] = [
  "youtube",
  "youtube_shorts",
  "tiktok",
  "instagram",
  "facebook",
  "x",
  "threads",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PIPELINE = [
  "Research",
  "Select topic",
  "Script",
  "Storyboard",
  "Generate assets",
  "Voice",
  "Captions",
  "Music",
  "Render",
  "Quality check",
  "Metadata",
  "Approval",
  "Schedule",
  "Publish",
  "Analytics",
];

function DailyQueue() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const planDef = PLANS.find((p) => p.key === (workspace?.plan ?? "free"));
  const autopilotAllowed = planDef?.autopilot ?? false;

  const config = useQuery({
    queryKey: ["autopilot", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("autopilot_configs")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    enabled: false,
    mode: "review",
    niche: "",
    audience: "",
    language: "en",
    visual_style: "cinematic",
    videos_per_week: 3,
    video_duration_seconds: 45,
    platforms: [] as Platform[],
    posting_days: [] as string[],
    posting_times: "09:00, 18:00",
    timezone: detectTimeZone(),
  });

  useEffect(() => {
    const c = config.data;
    if (!c) return;
    setForm({
      enabled: c.enabled,
      mode: c.mode,
      niche: c.niche ?? "",
      audience: c.audience ?? "",
      language: c.language,
      visual_style: c.visual_style ?? "cinematic",
      videos_per_week: c.videos_per_week,
      video_duration_seconds: c.video_duration_seconds,
      platforms: c.platforms,
      posting_days: c.posting_days,
      posting_times: c.posting_times.join(", "),
      timezone: c.timezone || detectTimeZone(),
    });
  }, [config.data]);

  const save = useMutation({
    mutationFn: async () => {
      await saveAutopilotConfig({
        data: {
          workspaceId: workspace!.id,
          enabled: form.enabled,
          mode: form.mode as "manual" | "review" | "full",
          niche: form.niche,
          audience: form.audience,
          language: form.language,
          visualStyle: form.visual_style,
          videosPerWeek: form.videos_per_week,
          videoDurationSeconds: form.video_duration_seconds,
          platforms: form.platforms,
          postingDays: form.posting_days as Array<
            "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"
          >,
          postingTimes: form.posting_times
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          timezone: isValidTimeZone(form.timezone) ? form.timezone : "UTC",
        },
      });
    },
    onSuccess: () => {
      toast.success("Queue settings saved");
      queryClient.invalidateQueries({ queryKey: ["autopilot", workspace?.id] });
      queryClient.invalidateQueries({ queryKey: ["autopilot-header", workspace?.id] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save the settings."),
  });

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const zones = useMemo(() => listTimeZones(), []);
  const upcoming = useMemo(() => {
    const schedule = {
      days: form.posting_days,
      times: form.posting_times
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      timezone: isValidTimeZone(form.timezone) ? form.timezone : "UTC",
    };
    return nextRuns(new Date(), schedule, 3);
  }, [form.posting_days, form.posting_times, form.timezone]);

  if (config.isLoading) {
    return (
      <>
        <PageHeader
          title="Daily Queue"
          description="Your settings drive the channel pipeline. Runs begin once generation, render and publishing providers are connected."
        />
        <div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </>
    );
  }

  const tz = isValidTimeZone(form.timezone) ? form.timezone : "UTC";

  return (
    <>
      <PageHeader
        title="Daily Queue"
        description="Your settings drive the channel pipeline. Runs begin once generation, render and publishing providers are connected."
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending || !workspace}>
            <Save className="mr-1.5 size-4" /> Save
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Content profile</CardTitle>
            <CardDescription>What the daily queue makes and for whom.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Daily queue enabled</p>
                <p className="text-xs text-muted-foreground">
                  {autopilotAllowed
                    ? "Nothing publishes without a connected social account."
                    : "Daily queue automation is available on Pro and Agency plans."}
                </p>
              </div>
              <Switch
                aria-label="Daily queue enabled"
                checked={autopilotAllowed && form.enabled}
                disabled={!autopilotAllowed}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              />
            </div>
            {!autopilotAllowed && (
              <p className="text-xs text-muted-foreground">
                You can still configure the profile below.{" "}
                <a className="text-primary underline-offset-4 hover:underline" href="/billing">
                  Upgrade to enable the daily queue.
                </a>
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="niche">Niche</Label>
              <Input
                id="niche"
                value={form.niche}
                onChange={(e) => setForm({ ...form, niche: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aud">Audience</Label>
              <Input
                id="aud"
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lang">Language</Label>
                <Input
                  id="lang"
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vs">Visual style</Label>
                <Input
                  id="vs"
                  value={form.visual_style}
                  onChange={(e) => setForm({ ...form, visual_style: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Approval mode</Label>
              <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual — I create everything myself</SelectItem>
                  <SelectItem value="review">Review before publishing</SelectItem>
                  <SelectItem value="full">Publish on schedule</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Cadence and platforms</CardTitle>
            <CardDescription>How often and where videos go out.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vpw">Videos per week</Label>
                <Input
                  id="vpw"
                  type="number"
                  min={1}
                  max={35}
                  value={form.videos_per_week}
                  onChange={(e) =>
                    setForm({ ...form, videos_per_week: Number(e.target.value) || 1 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dur">Target duration (seconds)</Label>
                <Input
                  id="dur"
                  type="number"
                  min={10}
                  max={900}
                  value={form.video_duration_seconds}
                  onChange={(e) =>
                    setForm({ ...form, video_duration_seconds: Number(e.target.value) || 45 })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="times">Posting times (comma separated)</Label>
              <Input
                id="times"
                value={form.posting_times}
                onChange={(e) => setForm({ ...form, posting_times: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz">Time zone</Label>
              <Input
                id="tz"
                list="autopilot-timezone-options"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                placeholder="Africa/Lagos"
                autoComplete="off"
              />
              <datalist id="autopilot-timezone-options">
                {zones.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Posting times above are read in this zone, so daylight-saving changes never shift
                your schedule.
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2.5">
              <p className="text-sm font-medium">Next scheduled runs</p>
              {upcoming.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Pick at least one day and time to preview the next runs.
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {upcoming.map((run) => (
                    <li key={run.toISOString()}>
                      {formatInTimeZone(run, tz, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hourCycle: "h23",
                      })}{" "}
                      <span className="text-foreground/70">({tz})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <Label>Posting days</Label>
              <div className="mt-2 flex flex-wrap gap-3">
                {DAYS.map((d) => (
                  <label key={d} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={form.posting_days.includes(d)}
                      onCheckedChange={() =>
                        setForm({ ...form, posting_days: toggle(form.posting_days, d) })
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Platforms</Label>
              <div className="mt-2 flex flex-wrap gap-3">
                {PLATFORMS.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={form.platforms.includes(p)}
                      onCheckedChange={() =>
                        setForm({ ...form, platforms: toggle(form.platforms, p) })
                      }
                    />
                    {p.replace(/_/g, " ")}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">The pipeline each run follows</CardTitle>
          <CardDescription>
            Every step is logged, and a failed step refunds the credits it reserved.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {PIPELINE.map((step, i) => (
            <Badge key={step} variant="outline">
              {i + 1}. {step}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
