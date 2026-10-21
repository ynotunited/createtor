import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Lightbulb, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";
import { recordAudit } from "@/lib/audit.functions";

import { ConfirmButton } from "@/components/dashboard/ConfirmButton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ListSkeleton } from "@/components/dashboard/Skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useElapsed } from "@/hooks/useElapsed";
import { generateIdeas } from "@/lib/ai.functions";
import { LANGUAGES } from "@/lib/options";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { CREDIT_COSTS } from "@/lib/pricing";

export const Route = createFileRoute("/_dash/ai-ideas")({
  head: () => ({
    meta: [
      { title: "Topic Ideas — Createtor" },
      {
        name: "description",
        content:
          "Generate channel topic ideas with hooks, formats, durations and CTAs tailored to your niche.",
      },
      { property: "og:title", content: "Topic Ideas — Createtor" },
      { property: "og:description", content: "Video topic ideas for your niche." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IdeasPage,
});

const PLATFORMS = [
  "youtube",
  "youtube_shorts",
  "tiktok",
  "instagram",
  "facebook",
  "x",
  "threads",
] as const;
const TONES = ["educational", "emotional", "storytelling", "energetic", "calm", "authoritative"];

function IdeasPage() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const runGenerate = useServerFn(generateIdeas);

  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [platform, setPlatform] = useState<string>("youtube_shorts");
  const [duration, setDuration] = useState("45");
  const [tone, setTone] = useState("storytelling");
  const [language, setLanguage] = useState("English");

  const saved = useQuery({
    queryKey: ["ideas", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_ideas")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      return await runGenerate({
        data: {
          workspaceId: workspace!.id,
          niche,
          audience: audience || null,
          platform,
          durationSeconds: Number(duration),
          tone,
          language,
          count: 6,
        },
      });
    },
    onError: (error) => toast.error(toUserMessage(error, "Idea generation failed.")),
  });

  const save = useMutation({
    mutationFn: async (idea: NonNullable<typeof generate.data>["ideas"][number]) => {
      const { error } = await supabase.from("content_ideas").insert({
        workspace_id: workspace!.id,
        title: idea.title,
        hook: idea.hook,
        topic: idea.topic,
        target_audience: idea.targetAudience,
        suggested_format: idea.suggestedFormat,
        estimated_duration_seconds: Math.round(idea.estimatedDurationSeconds),
        emotional_angle: idea.emotionalAngle,
        suggested_cta: idea.suggestedCta,
        visual_concept: idea.visualConcept,
        platform: platform as (typeof PLATFORMS)[number],
        tone,
        language,
        saved: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Idea saved");
      queryClient.invalidateQueries({ queryKey: ["ideas", workspace?.id] });
    },
    onError: () => toast.error("Could not save the idea."),
  });

  const removeIdea = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("content_ideas")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspace!.id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      toast.success("Idea deleted");
      if (workspace?.id) {
        recordAudit({
          data: {
            action: "idea.delete",
            entity: "content_ideas",
            entityId: id,
            workspaceId: workspace.id,
          },
        }).catch(() => undefined);
      }
      queryClient.invalidateQueries({ queryKey: ["ideas", workspace?.id] });
    },
    onError: () => toast.error("Could not delete the idea."),
  });

  function saveIdea(idea: NonNullable<typeof generate.data>["ideas"][number]) {
    if (saved.data?.some((i) => i.title === idea.title)) {
      toast.info("That idea is already saved");
      return;
    }
    save.mutate(idea);
  }

  const elapsed = useElapsed(generate.isPending);

  return (
    <>
      <PageHeader
        title="Topic Ideas"
        description="Describe your niche and audience. Every topic comes with a hook, format, duration, emotional angle and CTA."
      />

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Idea brief</CardTitle>
          <CardDescription>
            Estimated cost: {CREDIT_COSTS.ideaBatch} credits per batch of 6 ideas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="niche">Niche</Label>
            <Input
              id="niche"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. practical personal finance for new parents"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audience">Audience</Label>
            <Input
              id="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. first-time parents, 28-40"
            />
          </div>
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration">Target length (seconds)</Label>
            <Input
              id="duration"
              type="number"
              min={10}
              max={1800}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-3 md:col-span-2">
            <Button
              onClick={() => generate.mutate()}
              disabled={generate.isPending || niche.trim().length < 3}
            >
              {generate.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Lightbulb className="mr-1.5 size-4" />
              )}
              Find topics
            </Button>
            {generate.isPending && (
              <p className="pb-2 text-xs text-muted-foreground">
                Working… {elapsed}s. This can take up to a minute.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {generate.data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {generate.data.ideas.map((idea) => (
            <Card key={idea.title} className="glass-panel flex flex-col">
              <CardHeader>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{idea.suggestedFormat}</Badge>
                  <Badge variant="outline">{Math.round(idea.estimatedDurationSeconds)}s</Badge>
                </div>
                <CardTitle className="mt-2 text-base">{idea.title}</CardTitle>
                <CardDescription>{idea.hook}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Audience: </span>
                  {idea.targetAudience}
                </p>
                <p>
                  <span className="text-muted-foreground">Emotional angle: </span>
                  {idea.emotionalAngle}
                </p>
                <p>
                  <span className="text-muted-foreground">Visual concept: </span>
                  {idea.visualConcept}
                </p>
                <p>
                  <span className="text-muted-foreground">CTA: </span>
                  {idea.suggestedCta}
                </p>
                <Button
                  variant="secondary"
                  className="mt-auto"
                  onClick={() => saveIdea(idea)}
                  disabled={save.isPending}
                >
                  <Bookmark className="mr-1.5 size-4" /> Save idea
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Saved ideas</CardTitle>
          <CardDescription>Your idea bank, stored per workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {saved.isLoading ? (
            <ListSkeleton rows={3} />
          ) : saved.data?.length ? (
            saved.data.map((idea) => (
              <div
                key={idea.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{idea.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{idea.hook}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{idea.platform?.replace(/_/g, " ")}</Badge>
                  <ConfirmButton
                    title={`Delete "${idea.title}"?`}
                    description="This removes the idea from your saved bank."
                    onConfirm={() => removeIdea.mutate(idea.id)}
                    trigger={
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive"
                        aria-label="Delete idea"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    }
                  />
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={Bookmark}
              title="No saved ideas yet"
              description="Generate a batch above, then save the ones worth keeping to your idea bank."
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
