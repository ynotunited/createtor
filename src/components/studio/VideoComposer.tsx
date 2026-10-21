import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Clapperboard, Loader2, Plus, Save, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { type Cue, parseVtt } from "@/lib/vtt";

import { type Aspect, type CaptionPosition, type CaptionStyle, renderVideo } from "./renderer";

type Asset = {
  id: string;
  name: string;
  kind: string;
  storage_path: string | null;
  duration_seconds: number | null;
  tags: string[];
  url: string | null;
  captionsUrl: string | null;
};

const NONE = "none";
const CAPTION_STYLES: CaptionStyle[] = [
  "standard",
  "karaoke",
  "bold",
  "cinematic",
  "minimal",
  "social",
];

export function VideoComposer({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const assets = useQuery({
    queryKey: ["composer-assets", workspaceId],
    queryFn: async (): Promise<Asset[]> => {
      const { data, error } = await supabase
        .from("media_assets")
        .select("id,name,kind,storage_path,duration_seconds,tags")
        .eq("workspace_id", workspaceId)
        .in("kind", ["video", "image", "audio", "music"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const vtt = (p: string) => p.replace(/\.(mp4|wav)$/, ".vtt");
      const paths = data.flatMap((a) =>
        a.storage_path
          ? [a.storage_path, ...(a.tags.includes("captions") ? [vtt(a.storage_path)] : [])]
          : [],
      );
      const urls: Record<string, string> = {};
      if (paths.length) {
        const s = await supabase.storage.from("media").createSignedUrls(paths, 7200);
        for (const x of s.data ?? [])
          if (x.path && x.signedUrl && !x.error) urls[x.path] = x.signedUrl;
      }
      return data.map((a) => ({
        ...a,
        url: a.storage_path ? (urls[a.storage_path] ?? null) : null,
        captionsUrl: a.storage_path ? (urls[vtt(a.storage_path)] ?? null) : null,
      }));
    },
  });

  const all = assets.data ?? [];
  const visuals = all.filter((a) => (a.kind === "video" || a.kind === "image") && a.url);
  const voices = all.filter((a) => a.kind === "audio" && a.url);
  const tracks = all.filter((a) => a.kind === "music" && a.url);

  const [timeline, setTimeline] = useState<string[]>([]);
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [clipVolume, setClipVolume] = useState(100);
  const [voiceId, setVoiceId] = useState(NONE);
  const [voiceVolume, setVoiceVolume] = useState(100);
  const [musicId, setMusicId] = useState(NONE);
  const [musicVolume, setMusicVolume] = useState(35);
  const [duck, setDuck] = useState(true);
  const [captionSource, setCaptionSource] = useState<"none" | "clips" | "voiceover">("clips");
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("standard");
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>("bottom");
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{
    blob: Blob;
    url: string;
    mimeType: string;
    duration: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const resultRef = useRef(result);
  resultRef.current = result;

  useEffect(() => {
    return () => {
      // Cancel any in-flight render and free the generated object URL so we
      // never leak media streams or blob memory when the composer unmounts.
      abort.current?.abort();
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    };
  }, []);

  const byId = (id: string) => all.find((a) => a.id === id);
  const clips = timeline.map(byId).filter((a): a is Asset => Boolean(a));
  const move = (i: number, d: number) =>
    setTimeline((t) => {
      const n = [...t];
      const j = i + d;
      if (j < 0 || j >= n.length) return t;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  async function loadCaptions(): Promise<Cue[]> {
    if (captionSource === "voiceover") {
      const v = byId(voiceId);
      if (!v?.captionsUrl) return [];
      return parseVtt(await (await fetch(v.captionsUrl)).text());
    }
    if (captionSource === "clips") {
      const out: Cue[] = [];
      let offset = 0;
      for (const c of clips) {
        if (c.captionsUrl) {
          const cues = parseVtt(await (await fetch(c.captionsUrl)).text());
          out.push(...cues.map((q) => ({ ...q, start: q.start + offset, end: q.end + offset })));
        }
        offset += c.duration_seconds ?? 0;
      }
      return out;
    }
    return [];
  }

  async function render() {
    if (!clips.length) return;
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setProgress(0);
    abort.current = new AbortController();
    try {
      const voice = byId(voiceId);
      const music = byId(musicId);
      const out = await renderVideo({
        clips: clips.map((c) => ({
          url: c.url!,
          type: c.kind === "image" ? ("image" as const) : ("video" as const),
          ...(c.duration_seconds != null ? { duration: c.duration_seconds } : {}),
        })),
        aspect,
        clipVolume: clipVolume / 100,
        voiceover: voice?.url ? { url: voice.url, volume: voiceVolume / 100 } : null,
        music: music?.url ? { url: music.url, volume: musicVolume / 100, duck } : null,
        captions: await loadCaptions(),
        captionStyle,
        captionPosition,
        onProgress: setProgress,
        signal: abort.current.signal,
      });
      setResult({ ...out, url: URL.createObjectURL(out.blob) });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        toast.error(toUserMessage(e, "Render failed."));
    } finally {
      setProgress(null);
    }
  }

  async function save() {
    if (!result) return;
    if (!result.blob.size) {
      toast.error("This render is empty and was not saved. Please render again.");
      return;
    }
    setSaving(true);
    const ext = result.mimeType.includes("mp4") ? "mp4" : "webm";
    const path = `${workspaceId}/renders/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage
      .from("media")
      .upload(path, result.blob, { contentType: result.mimeType });
    if (up.error) {
      setSaving(false);
      toast.error(`Could not save: ${up.error.message}`);
      return;
    }
    const row = await supabase.from("media_assets").insert({
      workspace_id: workspaceId,
      kind: "video",
      name: name.trim() || `Final video — ${new Date().toLocaleString()}`,
      folder: "Renders",
      storage_path: path,
      mime_type: result.mimeType,
      size_bytes: result.blob.size,
      duration_seconds: Math.round(result.duration * 10) / 10,
      tags: ["render", aspect, ...(captionSource !== "none" ? ["burned-captions"] : [])],
      source: "rendered",
    });
    setSaving(false);
    if (row.error) {
      await supabase.storage.from("media").remove([path]);
      toast.error(row.error.message);
      return;
    }
    toast.success("Final video saved to your Media Library.");
    qc.invalidateQueries({ queryKey: ["media", workspaceId] });
    qc.invalidateQueries({ queryKey: ["composer-assets", workspaceId] });
  }

  const rendering = progress !== null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Build your final video</CardTitle>
          <CardDescription>
            Add scenes and clips in order, then choose voiceover, music and captions. Rendering
            happens in your browser in real time (no credits) — keep this tab open and visible until
            it finishes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Scenes &amp; clips in your library</Label>
            {visuals.length ? (
              <div className="flex flex-wrap gap-2">
                {visuals.map((v) => (
                  <Button
                    key={v.id}
                    size="sm"
                    variant="outline"
                    onClick={() => setTimeline((t) => [...t, v.id])}
                  >
                    <Plus className="mr-1 size-3.5" />
                    <span className="max-w-[180px] truncate">{v.name}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No scenes yet. Generate scene images or clips on the Storyboard page, or upload
                media in the Media Library.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Timeline</Label>
            {clips.length ? (
              <ol className="space-y-1.5">
                {clips.map((c, i) => (
                  <li
                    key={`${c.id}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <Badge variant="outline">{i + 1}</Badge>
                    <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.kind === "image" ? "still" : `${c.duration_seconds ?? "?"}s`}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => move(i, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => move(i, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="Remove"
                      onClick={() => setTimeline((t) => t.filter((_, j) => j !== i))}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add clips above to start your timeline.
              </p>
            )}
          </div>

          {result && (
            <div className="space-y-3">
              <video
                controls
                src={result.url}
                aria-label="Rendered preview"
                className="w-full rounded-lg bg-muted/30"
              />
              <div className="flex flex-wrap gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name your video"
                  className="max-w-xs"
                />
                <Button onClick={save} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 size-4" />
                  )}
                  Save to Media Library
                </Button>
                <Button variant="outline" asChild>
                  <a
                    href={result.url}
                    download={`createtor-video.${result.mimeType.includes("mp4") ? "mp4" : "webm"}`}
                  >
                    Download
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-panel h-fit">
        <CardHeader>
          <CardTitle className="text-lg">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Aspect ratio">
            <Select value={aspect} onValueChange={(v) => setAspect(v as Aspect)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">16:9 — YouTube</SelectItem>
                <SelectItem value="9:16">9:16 — Shorts, TikTok, Reels</SelectItem>
                <SelectItem value="1:1">1:1 — Square</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={`Clip sound ${clipVolume}%`}>
            <Slider
              value={[clipVolume]}
              max={100}
              step={5}
              onValueChange={([v]) => setClipVolume(v ?? 0)}
            />
          </Field>
          <Field label="Voiceover">
            <Select value={voiceId} onValueChange={setVoiceId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {voices.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {voiceId !== NONE && (
            <Field label={`Voiceover volume ${voiceVolume}%`}>
              <Slider
                value={[voiceVolume]}
                max={100}
                step={5}
                onValueChange={([v]) => setVoiceVolume(v ?? 0)}
              />
            </Field>
          )}
          <Field label="Background music">
            <Select value={musicId} onValueChange={setMusicId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {tracks.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {musicId !== NONE && (
            <>
              <Field label={`Music volume ${musicVolume}%`}>
                <Slider
                  value={[musicVolume]}
                  max={100}
                  step={5}
                  onValueChange={([v]) => setMusicVolume(v ?? 0)}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={duck} onCheckedChange={(v) => setDuck(Boolean(v))} />
                Lower music automatically while someone speaks
              </label>
            </>
          )}
          <Field label="Captions">
            <Select
              value={captionSource}
              onValueChange={(v) => setCaptionSource(v as typeof captionSource)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No captions</SelectItem>
                <SelectItem value="clips">From the clips</SelectItem>
                <SelectItem value="voiceover">From the voiceover</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {captionSource !== "none" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Style">
                <Select
                  value={captionStyle}
                  onValueChange={(v) => setCaptionStyle(v as CaptionStyle)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAPTION_STYLES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Position">
                <Select
                  value={captionPosition}
                  onValueChange={(v) => setCaptionPosition(v as CaptionPosition)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom">Bottom</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="top">Top</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
          {rendering ? (
            <div className="space-y-2">
              <Progress value={progress} />
              <Button variant="outline" className="w-full" onClick={() => abort.current?.abort()}>
                <Square className="mr-1.5 size-4" /> Cancel render ({Math.round(progress ?? 0)}%)
              </Button>
            </div>
          ) : (
            <Button className="w-full" onClick={render} disabled={!clips.length}>
              <Clapperboard className="mr-1.5 size-4" /> Render video
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
