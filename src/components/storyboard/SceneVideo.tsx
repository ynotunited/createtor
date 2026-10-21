import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clapperboard, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CREDIT_COSTS } from "@/lib/pricing";
import { checkSceneVideo, startSceneVideo } from "@/lib/video.functions";

type Props = {
  workspaceId: string;
  narration: string;
  videoPrompt: string;
  style: string;
  cameraMovement: string;
  lighting: string;
  label: string;
  aspectRatio?: "16:9" | "9:16";
  durationSeconds?: number;
};

export function SceneVideo(props: Props) {
  const start = useServerFn(startSceneVideo);
  const check = useServerFn(checkSceneVideo);
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<{
    videoUrl: string | null;
    captionsUrl: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await check({ data: { jobId } });
        if (cancelled) return;
        if (r.status === "completed") {
          setVideo({ videoUrl: r.videoUrl, captionsUrl: r.captionsUrl });
          setJobId(null);
          toast.success("Clip saved to Media Library");
          queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
          return;
        }
        if (r.status === "failed") {
          setError(r.error);
          setJobId(null);
          return;
        }
        setProgress(r.progress);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not check the clip.");
        setJobId(null);
        return;
      }
      timer.current = setTimeout(tick, 8000);
    };
    timer.current = setTimeout(tick, 6000);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [jobId, check, queryClient]);

  async function run() {
    setStarting(true);
    setError(null);
    setVideo(null);
    setProgress(0);
    const aspectRatio = props.aspectRatio ?? "16:9";
    try {
      const r = await start({
        data: {
          workspaceId: props.workspaceId,
          narration: props.narration,
          videoPrompt: props.videoPrompt,
          style: props.style,
          cameraMovement: props.cameraMovement,
          lighting: props.lighting,
          aspectRatio,
          ...(props.durationSeconds == null ? {} : { durationSeconds: props.durationSeconds }),
          name: props.label,
        },
      });
      setJobId(r.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the clip.");
    } finally {
      setStarting(false);
    }
  }

  const busy = starting || Boolean(jobId);
  const previewAspect =
    (props.aspectRatio ?? "16:9") === "9:16"
      ? "mx-auto aspect-[9/16] max-h-[70vh]"
      : "aspect-video";

  return (
    <div className="space-y-2">
      {video?.videoUrl && (
        <video
          controls
          crossOrigin="anonymous"
          className={`w-full rounded-lg border border-border bg-muted/30 ${previewAspect}`}
          aria-label="Generated video clip"
          src={video.videoUrl}
        >
          {video.captionsUrl && (
            <track default kind="captions" srcLang="en" label="Captions" src={video.captionsUrl} />
          )}
        </video>
      )}
      {jobId && (
        <div className="space-y-1">
          <Progress value={Math.max(progress, 5)} />
          <p className="text-xs text-muted-foreground">
            Creating clip with voiceover… usually 1–3 minutes.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error} No credits were charged.
        </p>
      )}
      <Button size="sm" variant="secondary" onClick={run} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Clapperboard className="mr-1.5 size-3.5" />
        )}
        {video ? "Regenerate clip" : "Generate clip"} · {CREDIT_COSTS.sceneVideo} credits
      </Button>
    </div>
  );
}
