import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Loader2, LayoutList, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { SceneImage } from "@/components/storyboard/SceneImage";
import { SceneVideo } from "@/components/storyboard/SceneVideo";
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
import { Textarea } from "@/components/ui/textarea";
import { useElapsed } from "@/hooks/useElapsed";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { generateStoryboard } from "@/lib/ai.functions";
import { CREDIT_COSTS } from "@/lib/pricing";
import { saveStoryboard, type SceneDraft } from "@/lib/project.functions";

export const Route = createFileRoute("/_dash/storyboard")({
  head: () => ({
    meta: [
      { title: "Storyboard — Createtor" },
      {
        name: "description",
        content:
          "Split a script into scenes with narration, visual prompts, camera moves, lighting and transitions.",
      },
      { property: "og:title", content: "Storyboard — Createtor" },
      { property: "og:description", content: "Scene-by-scene storyboard generation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoryboardPage,
});

const STYLES = ["cinematic", "documentary", "vibrant", "minimal", "studio", "anime", "3d render"];

type SceneRow = {
  id: string;
  sceneNumber: number;
  narration: string;
  visualDescription: string;
  imagePrompt: string;
  videoPrompt: string;
  cameraMovement: string;
  emotion: string;
  environment: string;
  lighting: string;
  durationSeconds: number;
  transition: string;
};

type DbScene = {
  id: string;
  scene_number: number;
  narration: string | null;
  visual_description: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  camera_movement: string | null;
  emotion: string | null;
  environment: string | null;
  lighting: string | null;
  duration_seconds: number | null;
  transition: string | null;
};

function fromDb(row: DbScene): SceneRow {
  return {
    id: row.id,
    sceneNumber: row.scene_number,
    narration: row.narration ?? "",
    visualDescription: row.visual_description ?? "",
    imagePrompt: row.image_prompt ?? "",
    videoPrompt: row.video_prompt ?? "",
    cameraMovement: row.camera_movement ?? "",
    emotion: row.emotion ?? "",
    environment: row.environment ?? "",
    lighting: row.lighting ?? "",
    durationSeconds: Number(row.duration_seconds ?? 5),
    transition: row.transition ?? "",
  };
}

function toDraft(scene: SceneRow): SceneDraft {
  return {
    sceneNumber: scene.sceneNumber,
    narration: scene.narration,
    visualDescription: scene.visualDescription,
    imagePrompt: scene.imagePrompt,
    videoPrompt: scene.videoPrompt,
    cameraMovement: scene.cameraMovement,
    emotion: scene.emotion,
    environment: scene.environment,
    lighting: scene.lighting,
    durationSeconds: scene.durationSeconds,
    transition: scene.transition,
  };
}

function StoryboardPage() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const run = useServerFn(generateStoryboard);
  const save = useServerFn(saveStoryboard);

  const [script, setScript] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [duration, setDuration] = useState("60");
  const [scriptId, setScriptId] = useState("");
  const [characterId, setCharacterId] = useState("none");
  const [aspect, setAspect] = useState<"16:9" | "9:16">("9:16");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const scripts = useQuery({
    queryKey: ["scripts-for-storyboard", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scripts")
        .select("id,title,hook,introduction,main_content,turning_point,payoff,cta")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const characters = useQuery({
    queryKey: ["characters-for-storyboard", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("id,name,appearance,hairstyle,clothing,personality,consistency_prompt")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const projects = useQuery({
    queryKey: ["storyboard-projects", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,title,aspect_ratio,visual_style,duration_seconds,script_id,updated_at")
        .eq("workspace_id", workspace!.id)
        .order("updated_at", { ascending: false })
        .limit(30);
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

  async function fetchScenes(id: string): Promise<SceneRow[]> {
    const { data, error } = await supabase
      .from("scenes")
      .select(
        "id,scene_number,narration,visual_description,image_prompt,video_prompt,camera_movement,emotion,environment,lighting,duration_seconds,transition",
      )
      .eq("project_id", id)
      .order("scene_number", { ascending: true });
    if (error) throw error;
    return (data as DbScene[]).map(fromDb);
  }

  function characterDescription(): string | null {
    if (characterId === "none") return null;
    const c = characters.data?.find((x) => x.id === characterId);
    if (!c) return null;
    return (
      c.consistency_prompt ||
      [c.name, c.appearance, c.hairstyle, c.clothing, c.personality].filter(Boolean).join(", ")
    );
  }

  function title(): string {
    const found = scripts.data?.find((s) => s.id === scriptId);
    return found?.title?.trim() || "Untitled video";
  }

  const generate = useMutation({
    mutationFn: async () => {
      const workspaceId = workspace!.id;
      const gen = await run({
        data: {
          workspaceId,
          script,
          visualStyle: style,
          targetDurationSeconds: Number(duration),
          characterDescription: characterDescription(),
        },
      });
      const drafts: SceneDraft[] = gen.scenes.map((s, index) => ({
        sceneNumber: index + 1,
        narration: s.narration,
        visualDescription: s.visualDescription,
        imagePrompt: s.imagePrompt,
        videoPrompt: s.videoPrompt,
        cameraMovement: s.cameraMovement,
        emotion: s.emotion,
        environment: s.environment,
        lighting: s.lighting,
        durationSeconds: Number(s.durationSeconds) || 5,
        transition: s.transition,
      }));
      const saved = await save({
        data: {
          workspaceId,
          projectId,
          title: title(),
          visualStyle: style,
          aspectRatio: aspect,
          durationSeconds: Number(duration),
          characterId: characterId === "none" ? null : characterId,
          scriptId: scriptId || null,
          scenes: drafts,
        },
      });
      const rows = await fetchScenes(saved.projectId);
      return { projectId: saved.projectId, scenes: rows };
    },
    onSuccess: (result) => {
      setProjectId(result.projectId);
      setScenes(result.scenes);
      setDirty(false);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["storyboard-projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      toast.success(`Storyboard saved · ${result.scenes.length} scenes`);
    },
    onError: (error) => toast.error(toUserMessage(error, "Storyboard generation failed.")),
  });

  const persist = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Build a storyboard first.");
      await save({
        data: {
          workspaceId: workspace!.id,
          projectId,
          title: title(),
          visualStyle: style,
          aspectRatio: aspect,
          durationSeconds: Number(duration),
          characterId: characterId === "none" ? null : characterId,
          scriptId: scriptId || null,
          scenes: scenes.map(toDraft),
        },
      });
      return await fetchScenes(projectId);
    },
    onSuccess: (rows) => {
      setScenes(rows);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["storyboard-projects"] });
      toast.success("Changes saved");
    },
    onError: (error) => toast.error(toUserMessage(error, "Could not save changes.")),
  });

  async function loadProject(id: string) {
    const found = projects.data?.find((p) => p.id === id);
    try {
      const rows = await fetchScenes(id);
      setProjectId(id);
      setScenes(rows);
      setDirty(false);
      setEditingId(null);
      if (found) {
        setStyle(found.visual_style ?? style);
        if (found.aspect_ratio === "16:9" || found.aspect_ratio === "9:16")
          setAspect(found.aspect_ratio);
        if (found.duration_seconds) setDuration(String(found.duration_seconds));
        setScriptId(found.script_id ?? "");
        if (found.script_id) loadScript(found.script_id);
      }
      toast.success(`Opened project · ${rows.length} scenes`);
    } catch (error) {
      toast.error(toUserMessage(error, "Could not open project."));
    }
  }

  function loadScript(id: string) {
    setScriptId(id);
    const found = scripts.data?.find((s) => s.id === id);
    if (!found) return;
    setScript(
      [
        found.hook,
        found.introduction,
        found.main_content,
        found.turning_point,
        found.payoff,
        found.cta,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  function updateScene(index: number, patch: Partial<SceneRow>) {
    setScenes((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  function moveScene(index: number, dir: -1 | 1) {
    setScenes((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const a = next[index]!;
      const b = next[target]!;
      next[index] = b;
      next[target] = a;
      return next.map((s, i) => ({ ...s, sceneNumber: i + 1 }));
    });
    setDirty(true);
  }

  function removeScene(index: number) {
    setScenes((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, sceneNumber: i + 1 })),
    );
    setDirty(true);
  }

  function reset() {
    setProjectId(null);
    setScenes([]);
    setDirty(false);
    setEditingId(null);
  }

  const busy = generate.isPending;
  const elapsed = useElapsed(busy);

  return (
    <>
      <PageHeader
        title="Storyboard"
        description="Every scene gets narration, an image prompt, a video prompt, camera movement, lighting and a transition. Storyboards are saved to a project automatically."
      />

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Source script</CardTitle>
          <CardDescription>
            Estimated cost: {CREDIT_COSTS.storyboard} credits per storyboard. Saved automatically,
            so nothing is lost if you leave the page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Load a saved script</Label>
              <Select value={scriptId} onValueChange={loadScript}>
                <SelectTrigger>
                  <SelectValue placeholder="Select script" />
                </SelectTrigger>
                <SelectContent>
                  {(scripts.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Character (optional)</Label>
              <Select value={characterId} onValueChange={setCharacterId}>
                <SelectTrigger>
                  <SelectValue placeholder="No character" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No character</SelectItem>
                  {(characters.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
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
                  {STYLES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Aspect ratio</Label>
              <Select value={aspect} onValueChange={(v) => setAspect(v as "16:9" | "9:16")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16 (Reels, Shorts, TikTok)</SelectItem>
                  <SelectItem value="16:9">16:9 (YouTube, landscape)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dur">Duration (seconds)</Label>
              <Input
                id="dur"
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Reopen a saved storyboard</Label>
              <Select value={projectId ?? ""} onValueChange={loadProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {(projects.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title} · {p.sceneCount} scenes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea
            rows={8}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Paste or load narration here…"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => generate.mutate()} disabled={busy || script.length < 40}>
              {busy ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <LayoutList className="mr-1.5 size-4" />
              )}
              {projectId ? "Regenerate storyboard" : "Build storyboard"}
            </Button>
            {scenes.length > 0 && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => persist.mutate()}
                  disabled={persist.isPending || !dirty}
                >
                  {persist.isPending ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 size-4" />
                  )}
                  Save changes
                </Button>
                <Button variant="ghost" onClick={reset} disabled={busy}>
                  New storyboard
                </Button>
              </>
            )}
          </div>
          {busy && (
            <p className="text-xs text-muted-foreground">
              Working… {elapsed}s. Storyboards can take up to a minute.
            </p>
          )}
        </CardContent>
      </Card>

      {scenes.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {scenes.map((scene, index) => (
            <Card key={scene.id} className="glass-panel">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Scene {scene.sceneNumber}</CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline">{Math.round(scene.durationSeconds)}s</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => moveScene(index, -1)}
                      disabled={index === 0}
                      aria-label="Move scene up"
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => moveScene(index, 1)}
                      disabled={index === scenes.length - 1}
                      aria-label="Move scene down"
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive"
                      onClick={() => removeScene(index)}
                      aria-label="Delete scene"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription>{scene.narration}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <p>
                    <span className="text-muted-foreground">Visual: </span>
                    {scene.visualDescription}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(editingId === scene.id ? null : scene.id)}
                  >
                    {editingId === scene.id ? "Close" : "Edit scene"}
                  </Button>
                </div>

                {editingId === scene.id && (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <div className="space-y-1.5">
                      <Label>Narration</Label>
                      <Textarea
                        rows={2}
                        value={scene.narration}
                        onChange={(e) => updateScene(index, { narration: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Visual description</Label>
                      <Textarea
                        rows={2}
                        value={scene.visualDescription}
                        onChange={(e) => updateScene(index, { visualDescription: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Image prompt</Label>
                      <Textarea
                        rows={2}
                        value={scene.imagePrompt}
                        onChange={(e) => updateScene(index, { imagePrompt: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Video prompt</Label>
                      <Textarea
                        rows={2}
                        value={scene.videoPrompt}
                        onChange={(e) => updateScene(index, { videoPrompt: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Camera movement</Label>
                        <Input
                          value={scene.cameraMovement}
                          onChange={(e) => updateScene(index, { cameraMovement: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Lighting</Label>
                        <Input
                          value={scene.lighting}
                          onChange={(e) => updateScene(index, { lighting: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Emotion</Label>
                        <Input
                          value={scene.emotion}
                          onChange={(e) => updateScene(index, { emotion: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Environment</Label>
                        <Input
                          value={scene.environment}
                          onChange={(e) => updateScene(index, { environment: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Transition</Label>
                        <Input
                          value={scene.transition}
                          onChange={(e) => updateScene(index, { transition: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Duration (seconds)</Label>
                        <Input
                          type="number"
                          value={scene.durationSeconds}
                          onChange={(e) =>
                            updateScene(index, {
                              durationSeconds: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {editingId !== scene.id && (
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{scene.cameraMovement}</Badge>
                    <Badge variant="secondary">{scene.lighting}</Badge>
                    <Badge variant="secondary">{scene.emotion}</Badge>
                    <Badge variant="secondary">{scene.transition}</Badge>
                  </div>
                )}

                {workspace?.id && (
                  <div className="pt-2">
                    <SceneImage
                      workspaceId={workspace.id}
                      prompt={`${scene.imagePrompt}. Style: ${style}. Lighting: ${scene.lighting}.`}
                      label={`Scene ${scene.sceneNumber} — ${scene.visualDescription.slice(0, 60)}`}
                      aspectHint={aspect === "9:16" ? "9:16 portrait" : "16:9 landscape"}
                    />
                    <div className="mt-3">
                      <SceneVideo
                        workspaceId={workspace.id}
                        narration={scene.narration}
                        videoPrompt={scene.videoPrompt}
                        style={style}
                        cameraMovement={scene.cameraMovement}
                        lighting={scene.lighting}
                        label={`Scene ${scene.sceneNumber} clip — ${scene.visualDescription.slice(0, 50)}`}
                        aspectRatio={aspect}
                        durationSeconds={scene.durationSeconds}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
