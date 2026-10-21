import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ListSkeleton } from "@/components/dashboard/Skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { researchTopics } from "@/lib/ai.functions";

export const Route = createFileRoute("/_dash/trend-research")({
  head: () => ({
    meta: [
      { title: "Topic Research — Createtor" },
      {
        name: "description",
        content:
          "Trending, rising, evergreen and seasonal topics for your niche, with repetition tracking.",
      },
      { property: "og:title", content: "Topic Research — Createtor" },
      { property: "og:description", content: "Topic research for your content pipeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrendResearch,
});

function TrendResearch() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const runResearch = useServerFn(researchTopics);
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");

  const stored = useQuery({
    queryKey: ["research", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_topics")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const research = useMutation({
    mutationFn: async () => {
      const used = (stored.data ?? []).map((t) => t.topic);
      const result = await runResearch({
        data: { niche, audience: audience || null, language: "English", excludeTopics: used },
      });
      const rows = result.topics.map((t) => ({
        workspace_id: workspace!.id,
        topic: t.topic,
        category: t.category,
        momentum: t.momentum,
        rationale: t.rationale,
      }));
      const { error } = await supabase.from("research_topics").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Research added");
      queryClient.invalidateQueries({ queryKey: ["research", workspace?.id] });
    },
    onError: (error) => toast.error(toUserMessage(error, "Research failed.")),
  });

  const markUsed = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("research_topics")
        .update({ used: true, used_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as used");
      queryClient.invalidateQueries({ queryKey: ["research", workspace?.id] });
    },
    onError: () => toast.error("Could not update the topic."),
  });

  const groups = ["trending", "rising", "evergreen", "seasonal"] as const;

  return (
    <>
      <PageHeader
        title="Topic Research"
        description="Topic suggestions grouped by momentum. Used topics are tracked so your channel does not repeat itself."
      />

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Research a niche</CardTitle>
          <CardDescription>
            Momentum labels are planning estimates from general knowledge, not live platform data.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[2fr_2fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="niche">Niche</Label>
            <Input id="niche" value={niche} onChange={(e) => setNiche(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aud">Audience</Label>
            <Input id="aud" value={audience} onChange={(e) => setAudience(e.target.value)} />
          </div>
          <Button
            onClick={() => research.mutate()}
            disabled={research.isPending || niche.length < 3}
          >
            {research.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Search className="mr-1.5 size-4" />
            )}
            Research
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => {
          const items = (stored.data ?? []).filter((t) => t.momentum === group);
          return (
            <Card key={group} className="glass-panel">
              <CardHeader>
                <CardTitle className="text-lg capitalize">{group}</CardTitle>
                <CardDescription>{items.length} topics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {stored.isLoading ? (
                  <ListSkeleton rows={2} />
                ) : items.length ? (
                  items.map((t) => (
                    <div key={t.id} className="rounded-lg border border-border px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{t.topic}</p>
                        {t.used ? (
                          <Badge variant="secondary">Used</Badge>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => markUsed.mutate(t.id)}>
                            Mark used
                          </Button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{t.rationale}</p>
                      {t.category && (
                        <Badge variant="outline" className="mt-2">
                          {t.category}
                        </Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing here yet.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
