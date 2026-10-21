import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Film, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_dash/create-video")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { aspect?: string; style?: string; caption?: string; title?: string } => {
    // Query params are user-controlled: coerce to bounded strings so a crafted
    // link cannot inject oversized values into the form or the project title.
    const text = (value: unknown, max: number): string | undefined =>
      typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined;
    const out: { aspect?: string; style?: string; caption?: string; title?: string } = {};
    const aspect = text(search["aspect"], 8);
    if (aspect) out.aspect = aspect;
    const style = text(search["style"], 40);
    if (style) out.style = style;
    const caption = text(search["caption"], 40);
    if (caption) out.caption = caption;
    const title = text(search["title"], 200);
    if (title) out.title = title;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Create Video — Createtor" },
      {
        name: "description",
        content: "Start a new video project: format, visual style, captions and voice.",
      },
      { property: "og:title", content: "Create Video — Createtor" },
      { property: "og:description", content: "Start a new channel video project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateVideo,
});

export const ASPECT_RATIOS = [
  { value: "16:9", label: "YouTube 16:9" },
  { value: "9:16", label: "Shorts / Reels / TikTok 9:16" },
  { value: "1:1", label: "Square 1:1" },
  { value: "4:5", label: "Feed 4:5" },
];

const CAPTION_STYLES = ["standard", "karaoke", "bold", "cinematic", "minimal", "social short"];
const VISUAL_STYLES = ["cinematic", "documentary", "vibrant", "minimal", "studio", "3d render"];

function CreateVideo() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const aspectValues = ASPECT_RATIOS.map((r) => r.value);
  const [title, setTitle] = useState(search.title ?? "");
  const [aspect, setAspect] = useState(
    search.aspect && aspectValues.includes(search.aspect) ? search.aspect : "9:16",
  );
  const [style, setStyle] = useState(
    search.style && VISUAL_STYLES.includes(search.style) ? search.style : "cinematic",
  );
  const [caption, setCaption] = useState(
    search.caption && CAPTION_STYLES.includes(search.caption) ? search.caption : "karaoke",
  );

  const projects = useQuery({
    queryKey: ["projects", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,title,status,aspect_ratio,updated_at")
        .eq("workspace_id", workspace!.id)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  type ProjectRow = NonNullable<typeof projects.data>[number];
  const listKey = ["projects", workspace?.id];

  const create = useMutation({
    mutationFn: async (input: {
      title: string;
      aspect: string;
      style: string;
      caption: string;
    }) => {
      const { error } = await supabase.from("projects").insert({
        workspace_id: workspace!.id,
        title: input.title || "Untitled video",
        aspect_ratio: input.aspect,
        visual_style: input.style,
        caption_style: input.caption,
      });
      if (error) throw error;
    },
    // Optimistic: the new project appears instantly and the button never waits.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ProjectRow[]>(listKey);
      if (previous) {
        const optimistic: ProjectRow = {
          id: `optimistic-${Date.now()}`,
          title: input.title || "Untitled video",
          status: "draft",
          aspect_ratio: input.aspect,
          updated_at: new Date().toISOString(),
        };
        queryClient.setQueryData<ProjectRow[]>(listKey, [optimistic, ...previous]);
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      toast.error("Could not create the project.");
    },
    onSuccess: () => {
      toast.success("Project created");
      setTitle("");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  return (
    <>
      <PageHeader
        title="Create Video"
        description="Create the project shell, then write the script, build the storyboard and generate assets."
      />

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">New project</CardTitle>
          <CardDescription>
            One project can produce several platform versions with their own hook, metadata and
            captions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2 xl:col-span-2">
            <Label htmlFor="t">Title</Label>
            <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={aspect} onValueChange={setAspect}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Visual style</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISUAL_STYLES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Caption style</Label>
            <Select value={caption} onValueChange={setCaption}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPTION_STYLES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 xl:col-span-3">
            <Button
              onClick={() => create.mutate({ title, aspect, style, caption })}
              disabled={!workspace}
              loading={create.isPending}
              loadingText="Creating…"
            >
              <Plus className="mr-1.5 size-4" /> Create project
            </Button>
            <Button asChild variant="secondary">
              <Link to="/script-studio">Write the script</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Projects</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {projects.isLoading ? (
            <ListSkeleton rows={4} />
          ) : projects.data?.length ? (
            projects.data.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Film className="size-4 text-primary" />
                  {p.title}
                </span>
                <span className="flex gap-1.5">
                  <Badge variant="outline">{p.aspect_ratio}</Badge>
                  <Badge variant="secondary">{p.status.replace(/_/g, " ")}</Badge>
                </span>
              </div>
            ))
          ) : (
            <EmptyState
              icon={Film}
              title="No projects yet"
              description="Create your first project above, then write the script and build the storyboard."
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
