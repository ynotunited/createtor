import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PenLine, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { PageHeader } from "@/components/dashboard/PageHeader";
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
import { generateScript } from "@/lib/ai.functions";
import { LANGUAGES } from "@/lib/options";
import { CREDIT_COSTS } from "@/lib/pricing";

export const Route = createFileRoute("/_dash/script-studio")({
  head: () => ({
    meta: [
      { title: "Script Studio — Createtor" },
      {
        name: "description",
        content:
          "Write, rewrite, shorten, translate and restructure video scripts with hook, story beats and CTA.",
      },
      { property: "og:title", content: "Script Studio — Createtor" },
      { property: "og:description", content: "Script editor for video narration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScriptStudio,
});

const MODES = [
  { value: "generate", label: "Generate from idea" },
  { value: "rewrite", label: "Rewrite script" },
  { value: "expand", label: "Expand script" },
  { value: "shorten", label: "Shorten script" },
  { value: "tone", label: "Change tone" },
  { value: "translate", label: "Translate" },
  { value: "stronger_hook", label: "Create stronger hook" },
  { value: "emotional", label: "Emotional version" },
  { value: "educational", label: "Educational version" },
  { value: "storytelling", label: "Storytelling version" },
] as const;

type Mode = (typeof MODES)[number]["value"];

const FIELDS = [
  ["hook", "Hook"],
  ["introduction", "Introduction"],
  ["mainContent", "Main content"],
  ["turningPoint", "Emotional turning point"],
  ["payoff", "Payoff"],
  ["cta", "CTA"],
] as const;

type ScriptDraft = {
  title: string;
  hook: string;
  introduction: string;
  mainContent: string;
  turningPoint: string;
  payoff: string;
  cta: string;
};

const EMPTY: ScriptDraft = {
  title: "",
  hook: "",
  introduction: "",
  mainContent: "",
  turningPoint: "",
  payoff: "",
  cta: "",
};

function ScriptStudio() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const runGenerate = useServerFn(generateScript);

  const [mode, setMode] = useState<Mode>("generate");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("storytelling");
  const [language, setLanguage] = useState("English");
  const [target, setTarget] = useState("60");
  const [draft, setDraft] = useState<ScriptDraft>(EMPTY);

  const fullText = useMemo(
    () =>
      [
        draft.hook,
        draft.introduction,
        draft.mainContent,
        draft.turningPoint,
        draft.payoff,
        draft.cta,
      ]
        .filter(Boolean)
        .join("\n\n"),
    [draft],
  );
  const wordCount = fullText.trim() ? fullText.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round((wordCount / 150) * 60);

  const scripts = useQuery({
    queryKey: ["scripts", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scripts")
        .select("id,title,word_count,estimated_duration_seconds,created_at")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const result = await runGenerate({
        data: {
          workspaceId: workspace!.id,
          mode,
          topic: topic || draft.title,
          audience: audience || null,
          tone,
          language,
          targetDurationSeconds: Number(target),
          existingScript: mode === "generate" ? null : fullText || null,
        },
      });
      return result;
    },
    onSuccess: (result) => setDraft(result),
    onError: (error) => toast.error(toUserMessage(error, "Script generation failed.")),
  });

  const elapsed = useElapsed(generate.isPending);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("scripts").insert({
        workspace_id: workspace!.id,
        title: draft.title || topic || "Untitled script",
        hook: draft.hook,
        introduction: draft.introduction,
        main_content: draft.mainContent,
        turning_point: draft.turningPoint,
        payoff: draft.payoff,
        cta: draft.cta,
        language,
        tone,
        word_count: wordCount,
        estimated_duration_seconds: estimatedSeconds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Script saved");
      queryClient.invalidateQueries({ queryKey: ["scripts", workspace?.id] });
    },
    onError: () => toast.error("Could not save the script."),
  });

  return (
    <>
      <PageHeader
        title="Script Studio"
        description="Structured narration with a hook, story beats and a call to action — editable at every step."
        actions={
          <Button onClick={() => save.mutate()} disabled={!fullText || save.isPending}>
            <Save className="mr-1.5 size-4" /> Save script
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="glass-panel h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Brief</CardTitle>
            <CardDescription>
              Estimated cost: {CREDIT_COSTS.scriptGenerate} credits per generation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic">Topic</Label>
              <Textarea
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={3}
                placeholder="What is this video about?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aud">Audience</Label>
              <Input id="aud" value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tone">Tone</Label>
                <Input id="tone" value={tone} onChange={(e) => setTone(e.target.value)} />
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="target">Target duration (seconds)</Label>
              <Input
                id="target"
                type="number"
                min={15}
                max={1800}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => generate.mutate()}
              disabled={generate.isPending || (!topic && !fullText)}
            >
              {generate.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <PenLine className="mr-1.5 size-4" />
              )}
              Run
            </Button>
            {generate.isPending && (
              <p className="text-xs text-muted-foreground">
                Working… {elapsed}s. This can take up to a minute.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="glass-panel">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Script</CardTitle>
                <CardDescription>
                  {wordCount} words · about {estimatedSeconds}s of narration
                </CardDescription>
              </div>
              <Badge variant="outline">{language}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              {FIELDS.map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Textarea
                    id={key}
                    rows={key === "mainContent" ? 8 : 3}
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-lg">Saved scripts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {scripts.data?.length ? (
                scripts.data.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0 truncate">{s.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {s.word_count} words · {s.estimated_duration_seconds}s
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No scripts saved yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
