import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { saveGeneratedImage } from "@/lib/media.functions";
import { CREDIT_COSTS } from "@/lib/pricing";
import { streamImage } from "@/lib/stream-image";

type Props = { workspaceId: string; prompt: string; label: string; aspectHint: string };

export function SceneImage({ workspaceId, prompt, label, aspectHint }: Props) {
  const save = useServerFn(saveGeneratedImage);
  const queryClient = useQueryClient();
  const [image, setImage] = useState<string | null>(null);
  const [final, setFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setFinal(false);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      let finished: string | null = null;
      await streamImage(
        "/api/v1/generate-image",
        {
          prompt: `${prompt}. Composition for ${aspectHint} video frame. No text or watermarks.`,
          workspaceId,
        },
        (frame, isFinal) => {
          setImage(frame);
          setFinal(isFinal);
          if (isFinal) finished = frame;
        },
        undefined,
        { Authorization: `Bearer ${token}` },
      );
      if (!finished) throw new Error("No image was returned.");
      const result = await save({ data: { workspaceId, dataUrl: finished, prompt, name: label } });
      toast.success(`Image saved to Media Library · ${result.balance} credits left`);
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Image generation failed.";
      setError(message.replace(/^Image generation failed: \d+ /, ""));
      if (!final) setImage(null);
    } finally {
      setBusy(false);
    }
  }

  const portrait = /9\s*:\s*16|portrait|vertical/i.test(aspectHint);

  return (
    <div className="space-y-2">
      <div
        className={`relative overflow-hidden rounded-lg border border-border bg-muted/30 ${
          portrait ? "mx-auto aspect-[9/16] max-h-[70vh]" : "aspect-video"
        }`}
      >
        {image ? (
          <img
            src={image}
            alt={label}
            loading="lazy"
            decoding="async"
            className={`size-full object-cover transition-[filter] duration-500 ${final ? "blur-0" : "blur-2xl"}`}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <ImageIcon className="size-6" aria-hidden="true" />
            )}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error} No credits were charged.
        </p>
      )}
      <Button size="sm" variant="secondary" onClick={run} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : image ? (
          <RefreshCw className="mr-1.5 size-3.5" />
        ) : (
          <ImageIcon className="mr-1.5 size-3.5" />
        )}
        {image ? "Regenerate image" : "Generate image"} · {CREDIT_COSTS.sceneImage} credits
      </Button>
    </div>
  );
}
