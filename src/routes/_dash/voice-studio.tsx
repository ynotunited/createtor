import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Mic } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { ModuleStatus } from "@/components/dashboard/ModuleStatus";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ListSkeleton } from "@/components/dashboard/Skeletons";
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
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { VoiceoverGenerator } from "@/components/voice/VoiceoverGenerator";
import { createVoiceProfile } from "@/lib/voice-profile.functions";
import { BUILTIN_VOICES, type BuiltinVoiceId } from "@/lib/voices";

export const Route = createFileRoute("/_dash/voice-studio")({
  head: () => ({
    meta: [
      { title: "Voice Studio — Createtor" },
      {
        name: "description",
        content:
          "Voice profiles, languages, accents and consent-verified voice cloning for your narration.",
      },
      { property: "og:title", content: "Voice Studio — Createtor" },
      { property: "og:description", content: "Manage narration voices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VoiceStudio,
});

function VoiceStudio() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    language: "English",
    accent: "",
    tone: "",
    gender: "",
  });
  const [isClone, setIsClone] = useState(false);
  const [consent, setConsent] = useState(false);
  const [builtinVoice, setBuiltinVoice] = useState<BuiltinVoiceId>("Kore");

  const voices = useQuery({
    queryKey: ["voices", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voices")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      await createVoiceProfile({
        data: {
          workspaceId: workspace!.id,
          name: form.name,
          language: form.language,
          accent: form.accent,
          tone: form.tone,
          gender: form.gender,
          isClone,
          builtinVoice: builtinVoice,
          consentGiven: consent,
        },
      });
    },
    onSuccess: () => {
      toast.success("Voice profile created");
      setForm({ name: "", language: "English", accent: "", tone: "", gender: "" });
      setIsClone(false);
      setConsent(false);
      setBuiltinVoice("Kore");
      queryClient.invalidateQueries({ queryKey: ["voices", workspace?.id] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save the voice profile."),
  });

  return (
    <>
      <PageHeader
        title="Voice Studio"
        description="Define the voice profiles your videos use. Cloning requires an explicit consent record before any audio is processed."
      />

      {workspace?.id && <VoiceoverGenerator workspaceId={workspace.id} />}

      <ModuleStatus
        phase="Coming soon"
        title="Voice cloning"
        description="Profiles below are saved now. Cloning a real person's voice from a sample is not available yet and will always require the consent record."
        capabilities={["Clone a voice from an approved sample", "Use cloned voices in videos"]}
        requires={["A voice-cloning provider", "Consent verification for any cloned voice"]}
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="glass-panel h-fit">
          <CardHeader>
            <CardTitle className="text-lg">New voice profile</CardTitle>
            <CardDescription>
              Profiles are stored now and bind to a provider voice when one is connected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                ["name", "Profile name"],
                ["language", "Language"],
                ["accent", "Accent"],
                ["tone", "Tone"],
                ["gender", "Voice gender"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            {!isClone && (
              <div className="space-y-2">
                <Label htmlFor="builtin-voice">Built-in voice</Label>
                <Select
                  value={builtinVoice}
                  onValueChange={(v) => setBuiltinVoice(v as BuiltinVoiceId)}
                >
                  <SelectTrigger id="builtin-voice">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUILTIN_VOICES.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label} — {v.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Links this profile to one of the built-in narration voices so it can be used in
                  voiceovers.
                </p>
              </div>
            )}
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={isClone} onCheckedChange={(v) => setIsClone(Boolean(v))} />
              This is a cloned voice from an uploaded sample
            </label>
            {isClone && (
              <label className="flex items-start gap-2 rounded-lg border border-warning/40 p-3 text-xs">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(Boolean(v))} />I
                confirm the voice owner gave explicit, documented permission for this voice to be
                cloned and used in generated videos.
              </label>
            )}
            <Button
              className="w-full"
              onClick={() => save.mutate()}
              disabled={save.isPending || form.name.length < 2 || (isClone && !consent)}
            >
              <Mic className="mr-1.5 size-4" /> Save profile
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Voice profiles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {voices.isLoading ? (
              <ListSkeleton rows={3} />
            ) : voices.data?.length ? (
              voices.data.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[v.language, v.accent, v.tone].filter(Boolean).join(" · ")}
                      {v.provider_voice_id ? ` · ${v.provider_voice_id}` : ""}
                    </p>
                  </div>
                  <span className="flex gap-1.5">
                    {v.is_clone && <Badge variant="outline">Clone</Badge>}
                    <Badge variant={v.consent_confirmed ? "default" : "secondary"}>
                      {v.is_clone
                        ? v.consent_confirmed
                          ? "Consent on file"
                          : "Consent missing"
                        : "Standard"}
                    </Badge>
                  </span>
                </div>
              ))
            ) : (
              <EmptyState
                icon={Mic}
                title="No voice profiles yet"
                description="Create a profile on the left to reuse it across characters and videos."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
