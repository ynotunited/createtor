import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { ExternalLink, Send } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ListSkeleton } from "@/components/dashboard/Skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_dash/published")({
  head: () => ({
    meta: [
      { title: "Published — Createtor" },
      {
        name: "description",
        content: "Every video this workspace has published, with its platform and live link.",
      },
      { property: "og:title", content: "Published — Createtor" },
      { property: "og:description", content: "Your published content history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Published,
});

function Published() {
  const { data: workspace } = useWorkspace();

  const posts = useQuery({
    queryKey: ["published", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("published_posts")
        .select("id,platform,external_url,published_at,projects(title)")
        .eq("workspace_id", workspace!.id)
        .order("published_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <PageHeader
        title="Published"
        description="Publishing writes a record here with the live URL, which analytics then tracks against."
      />

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Publishing history</CardTitle>
          <CardDescription>
            Nothing is published until you connect a social account and approve or schedule a video.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {posts.isLoading ? (
            <ListSkeleton rows={4} />
          ) : posts.data?.length ? (
            posts.data.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{p.projects?.title ?? "Untitled"}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(p.published_at), "d MMM yyyy, HH:mm")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{p.platform.replace(/_/g, " ")}</Badge>
                  {p.external_url && (
                    <a
                      href={p.external_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary"
                      aria-label="Open published post"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={Send}
              title="Nothing published yet"
              description="Connect a social account, then approve or schedule a video to see it here."
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
