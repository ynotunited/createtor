import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { supabase } from "@/integrations/supabase/client";
import { CREDIT_COSTS } from "@/lib/pricing";
import { generateVoiceover } from "@/lib/voice.functions";
import { BUILTIN_VOICES, DELIVERY_STYLES, type BuiltinVoiceId, voiceoverCost } from "@/lib/voices";

export function VoiceoverGenerator({ workspaceId }: { workspaceId: string }) {
  const run = useServerFn(generateVoiceover);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [selection, setSelection] = useState("Kore");
  const [direction, setDirection] = useState("");

  const profiles = useQuery({
    queryKey: ["voices", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voices")
        .select("id,name,provider_voice_id")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data.filter((v) => BUILTIN_VOICES.some((b) => b.id === v.provider_voice_id));
    },
  });

  const voice: BuiltinVoiceId = selection.startsWith("profile:")
    ? ((profiles.data?.find((p) => p.id === selection.slice(8))?.provider_voice_id ??
        "Kore") as BuiltinVoiceId)
    : (selection as BuiltinVoiceId);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const cost = voiceoverCost(text || "x", CREDIT_COSTS.voiceoverPerMinute);
  const onError = (e: unknown) =>
    toast.error(
      `${e instanceof Error ? e.message : "Voice generation failed."} No credits were charged.`,
    );

  const preview = useMutation({
    mutationFn: () =>
      run({
        data: {
          workspaceId,
          voice,
          direction,
          preview: true,
          name: "preview",
          text: text.trim() || "Hi! This is how your videos will sound with this voice.",
        },
      }),
    onSuccess: (r) => setPreviewUrl(r.url),
    onError,
  });

  const generate = useMutation({
    mutationFn: () =>
      run({
        data: {
          workspaceId,
          voice,
          direction,
          preview: false,
          text,
          name: name.trim() || `Voiceover — ${voice}`,
        },
      }),
    onSuccess: (r) => {
      setResultUrl(r.url);
      toast.success(`Voiceover saved to your Media Library (${Math.round(r.durationSeconds)}s).`);
      qc.invalidateQueries({ queryKey: ["media", workspaceId] });
      qc.invalidateQueries({ queryKey: ["credits"] });
    },
    onError,
  });

  const busy = preview.isPending || generate.isPending;

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-lg">Generate a voiceover</CardTitle>
        <CardDescription>
          Paste narration, pick a voice and delivery. Preview costs 1 credit; a full voiceover costs{" "}
          {CREDIT_COSTS.voiceoverPerMinute} credits per minute (this one: {cost}). Captions are
          created automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Voice</Label>
            <Select value={selection} onValueChange={setSelection}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {profiles.data?.map((p) => (
                  <SelectItem key={p.id} value={`profile:${p.id}`}>
                    {p.name} — {p.provider_voice_id} (saved profile)
                  </SelectItem>
                ))}
                {BUILTIN_VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label} — {v.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Delivery</Label>
            <Select
              value={direction || "natural"}
              onValueChange={(v) => setDirection(v === "natural" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_STYLES.map((d) => (
                  <SelectItem key={d.label} value={d.id || "natural"}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vo-name">Name in Media Library</Label>
            <Input
              id="vo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Episode 1 narration"
            />
          </div>
        </div>
        <Textarea
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the narration for your video…"
          maxLength={4000}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => preview.mutate()} disabled={busy}>
            {preview.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 size-4" />
            )}
            Preview voice (1 credit)
          </Button>
          <Button onClick={() => generate.mutate()} disabled={busy || text.trim().length < 5}>
            {generate.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Mic className="mr-1.5 size-4" />
            )}
            Generate voiceover ({cost} credits)
          </Button>
        </div>
        {generate.isPending && (
          <p className="text-xs text-muted-foreground">
            Long narration can take up to a minute. Keep this page open.
          </p>
        )}
        {previewUrl && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Preview</p>
            <audio controls autoPlay src={previewUrl} className="w-full" />
          </div>
        )}
        {resultUrl && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Saved voiceover</p>
            <audio controls src={resultUrl} className="w-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
