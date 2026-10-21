import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Film } from "lucide-react";

import { VideoComposer } from "@/components/studio/VideoComposer";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ListSkeleton } from "@/components/dashboard/Skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_dash/video-studio")({
  head: () => ({
    meta: [
      { title: "Video Studio — Createtor" },
      {
        name: "description",
        content:
          "Preview scenes, swap media, adjust narration, captions, music and scene order before rendering.",
      },
      { property: "og:title", content: "Video Studio — Createtor" },
      { property: "og:description", content: "Simple creator-friendly video editor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VideoStudio,
});

function VideoStudio() {
  const { data: workspace } = useWorkspace();

  const projects = useQuery({
    queryKey: ["studio-projects", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,title,status,aspect_ratio,caption_style,visual_style")
        .eq("workspace_id", workspace!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const ids = data.map((p) => p.id);
      const counts: Record<string, number> = {};
      if (ids.length) {
        const sc = await supabase.from("scenes").select("project_id").in("project_id", ids);
        if (sc.error) throw sc.error;
        for (const row of sc.data) counts[row.project_id] = (counts[row.project_id] ?? 0) + 1;
      }
      return data
        .map((p) => ({ ...p, sceneCount: counts[p.id] ?? 0 }))
        .filter((p) => p.sceneCount > 0);
    },
  });

  return (
    <>
      <PageHeader
        title="Video Studio"
        description="A deliberately simple editor: scene previews, swaps, narration, captions, music and ordering."
      />

      {workspace?.id && <VideoComposer workspaceId={workspace.id} />}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Projects ready to edit</CardTitle>
          <CardDescription>Projects with a storyboard appear here first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {projects.isLoading ? (
            <ListSkeleton rows={3} />
          ) : projects.data?.length ? (
            projects.data.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="text-sm">{p.title}</span>
                <span className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{p.aspect_ratio}</Badge>
                  <Badge variant="outline">{p.caption_style}</Badge>
                  <Badge variant="outline">{p.sceneCount} scenes</Badge>
                  <Badge variant="secondary">{p.status.replace(/_/g, " ")}</Badge>
                </span>
              </div>
            ))
          ) : (
            <EmptyState
              icon={Film}
              title="No storyboards yet"
              description="Build one on the Storyboard page and it will appear here ready to edit."
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
