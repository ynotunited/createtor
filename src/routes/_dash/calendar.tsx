import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, endOfWeek, format, isSameDay, startOfWeek } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_dash/calendar")({
  head: () => ({
    meta: [
      { title: "Content Calendar — Createtor" },
      {
        name: "description",
        content:
          "See drafts, renders, approvals, scheduled and published videos on one publishing calendar.",
      },
      { property: "og:title", content: "Content Calendar — Createtor" },
      { property: "og:description", content: "Your publishing schedule at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

const STATUS_LEGEND = [
  ["draft", "Draft"],
  ["rendering", "Rendering"],
  ["awaiting_approval", "Awaiting approval"],
  ["scheduled", "Scheduled"],
  ["published", "Published"],
  ["failed", "Failed"],
];

function CalendarPage() {
  const { data: workspace } = useWorkspace();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const posts = useQuery({
    queryKey: ["calendar", workspace?.id, weekStart.toISOString()],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_posts")
        .select("id,title,platform,scheduled_for,status")
        .eq("workspace_id", workspace!.id)
        .gte("scheduled_for", weekStart.toISOString())
        .lte("scheduled_for", endOfWeek(weekStart, { weekStartsOn: 1 }).toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <>
      <PageHeader
        title="Content Calendar"
        description="Everything scheduled for this workspace, by day and platform."
        actions={
          <>
            <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              Previous week
            </Button>
            <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              Next week
            </Button>
          </>
        }
      />

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">
            {format(weekStart, "d MMM")} – {format(addDays(weekStart, 6), "d MMM yyyy")}
          </CardTitle>
          <CardDescription>
            Scheduling is created from a project once a social account is connected. Drag-and-drop
            rescheduling and publishing are coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {posts.isLoading ? (
            <div className="grid gap-3 md:grid-cols-7" aria-hidden="true">
              {days.map((day) => (
                <Skeleton key={day.toISOString()} className="h-32 w-full rounded-lg" />
              ))}
            </div>
          ) : !posts.data?.length ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled this week"
              description="Create scheduling from a project once a social account is connected."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-7">
              {days.map((day) => {
                const items = (posts.data ?? []).filter((p) =>
                  isSameDay(new Date(p.scheduled_for), day),
                );
                return (
                  <div key={day.toISOString()} className="rounded-lg border border-border p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {format(day, "EEE d")}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {items.length ? (
                        items.map((item) => (
                          <div key={item.id} className="rounded-md bg-muted px-2 py-1.5">
                            <p className="truncate text-xs font-medium">
                              {item.title ?? "Untitled"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {format(new Date(item.scheduled_for), "HH:mm")} ·{" "}
                              {item.platform.replace(/_/g, " ")}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-[11px] text-muted-foreground">—</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-1.5">
            {STATUS_LEGEND.map(([key, label]) => (
              <Badge key={key} variant="outline">
                {label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
