import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Exact MIME allowlist. A prefix check (any `image/*`) would accept
 * `image/svg+xml`, which can carry script and is a stored-XSS risk when served
 * back, so only known-safe media types are accepted. Types the browser cannot
 * verify are rejected here even though the input's `accept` already hints.
 */
const ALLOWED_MIME: Record<string, "image" | "video" | "audio"> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/mp4": "audio",
  "audio/aac": "audio",
  "audio/ogg": "audio",
  "audio/webm": "audio",
};

const ACCEPT = Object.keys(ALLOWED_MIME).join(",");

function kindOf(mime: string, asMusic: boolean) {
  const base = ALLOWED_MIME[mime.toLowerCase()];
  if (!base) return null;
  return base === "audio" && asMusic ? "music" : base;
}

function mediaDuration(file: File): Promise<number | null> {
  if (!file.type.startsWith("video/") && !file.type.startsWith("audio/"))
    return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    const url = URL.createObjectURL(file);
    // Revoke the object URL on every exit path — including a stalled load that
    // never fires loadedmetadata/error — so the Blob isn't pinned in memory.
    let settled = false;
    const timeout = setTimeout(() => done(null), 10_000);
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      el.onloadedmetadata = null;
      el.onerror = null;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () =>
      done(Number.isFinite(el.duration) ? Math.round(el.duration * 10) / 10 : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

export function MediaUploader({ workspaceId }: { workspaceId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [audioAs, setAudioAs] = useState<"music" | "audio">("music");
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      const mime = file.type.toLowerCase();
      const kind = kindOf(mime, audioAs === "music");
      if (!kind) {
        toast.error(`${file.name}: this file type isn't supported.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: files must be 50 MB or smaller.`);
        continue;
      }
      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${workspaceId}/uploads/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("media").upload(path, file, { contentType: mime });
      if (up.error) {
        toast.error(`${file.name}: ${up.error.message}`);
        continue;
      }
      const duration = await mediaDuration(file);
      const row = await supabase.from("media_assets").insert({
        workspace_id: workspaceId,
        kind,
        name: file.name.slice(0, 200),
        folder: kind === "music" ? "Music" : "Uploads",
        storage_path: path,
        mime_type: mime,
        size_bytes: file.size,
        duration_seconds: duration,
        tags: ["upload"],
        source: "upload",
      });
      if (row.error) {
        await supabase.storage.from("media").remove([path]);
        toast.error(`${file.name}: ${row.error.message}`);
        continue;
      }
      ok++;
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    if (ok) {
      toast.success(`${ok} file${ok > 1 ? "s" : ""} uploaded.`);
      qc.invalidateQueries({ queryKey: ["media", workspaceId] });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={audioAs} onValueChange={(v) => setAudioAs(v as "music" | "audio")}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="music">Audio files are music</SelectItem>
          <SelectItem value="audio">Audio files are voice/SFX</SelectItem>
        </SelectContent>
      </Select>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => upload(e.target.files)}
      />
      <Button onClick={() => input.current?.click()} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <Upload className="mr-1.5 size-4" />
        )}
        Upload media
      </Button>
      <span className="text-xs text-muted-foreground">
        Images, video, audio · up to 50 MB each · only use music you have rights to
      </span>
    </div>
  );
}
