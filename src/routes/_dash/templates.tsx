import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Clapperboard, LayoutTemplate } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CardGridSkeleton } from "@/components/dashboard/Skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_dash/templates")({
  head: () => ({
    meta: [
      { title: "Templates — Createtor" },
      {
        name: "description",
        content:
          "Proven video formats: faceless storytelling, educational, documentary, listicle, avatar and more.",
      },
      { property: "og:title", content: "Templates — Createtor" },
      { property: "og:description", content: "Ready-made video formats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Templates,
});

function Templates() {
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .order("is_system", { ascending: false })
        .order("name")
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <PageHeader
        title="Templates"
        description="Each template sets the structure, pacing, format and caption style a script and storyboard start from."
      />

      {templates.isLoading ? (
        <CardGridSkeleton className="sm:grid-cols-2 xl:grid-cols-3" />
      ) : templates.data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.data.map((t) => {
            const search: { aspect?: string; style?: string; caption?: string; title: string } = {
              title: t.name,
            };
            if (t.default_aspect_ratio) search.aspect = t.default_aspect_ratio;
            if (t.visual_style) search.style = t.visual_style;
            if (t.caption_style) search.caption = t.caption_style;
            return (
              <Card key={t.id} className="glass-panel">
                <CardHeader>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">{t.category}</Badge>
                    <Badge variant="secondary">{t.default_aspect_ratio}</Badge>
                  </div>
                  <CardTitle className="mt-3 text-base">{t.name}</CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs text-muted-foreground">
                  <p>
                    {t.default_duration_seconds ? `~${t.default_duration_seconds}s · ` : ""}
                    {[t.visual_style, t.caption_style].filter(Boolean).join(" · ")}
                  </p>
                  <Button asChild size="sm" variant="secondary" className="w-full">
                    <Link to="/create-video" search={search}>
                      <Clapperboard className="mr-1.5 size-3.5" /> Use template
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates available"
          description="Templates appear here once they are published for your workspace."
        />
      )}
    </>
  );
}
