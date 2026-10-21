import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { recordAudit } from "@/lib/audit.functions";

import { ConfirmButton } from "@/components/dashboard/ConfirmButton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ModuleStatus } from "@/components/dashboard/ModuleStatus";
import { CardGridSkeleton } from "@/components/dashboard/Skeletons";
import { MediaUploader } from "@/components/media/MediaUploader";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_dash/media-library")({
  head: () => ({
    meta: [
      { title: "Media Library — Createtor" },
      {
        name: "description",
        content:
          "All images, video clips, audio, music and generated assets for your workspace in one place.",
      },
      { property: "og:title", content: "Media Library — Createtor" },
      { property: "og:description", content: "Your workspace media assets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MediaLibrary,
});

const KINDS = ["all", "image", "video", "audio", "music"];

function MediaLibrary() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");

  const assets = useQuery({
    queryKey: ["media", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_assets")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const paths = data.map((a) => a.storage_path).filter((p): p is string => Boolean(p));
      const vttOf = (p: string) => p.replace(/\.(mp4|wav)$/, ".vtt");
      const captionPaths = data
        .filter((a) => a.tags?.includes("captions") && /\.(mp4|wav)$/.test(a.storage_path ?? ""))
        .map((a) => vttOf(a.storage_path!));
      const urls: Record<string, string> = {};
      const all = [...paths, ...captionPaths];
      if (all.length) {
        const signed = await supabase.storage.from("media").createSignedUrls(all, 3600);
        for (const s of signed.data ?? [])
          if (s.path && s.signedUrl && !s.error) urls[s.path] = s.signedUrl;
      }
      return data.map((a) => ({
        ...a,
        url: a.storage_path ? (urls[a.storage_path] ?? null) : null,
        captionsUrl: a.storage_path ? (urls[vttOf(a.storage_path)] ?? null) : null,
      }));
    },
  });

  type AssetRow = NonNullable<typeof assets.data>[number];
  const listKey = ["media", workspace?.id];

  const remove = useMutation({
    mutationFn: async (asset: {
      id: string;
      storage_path: string | null;
      tags: string[] | null;
    }) => {
      const paths: string[] = [];
      if (asset.storage_path) {
        paths.push(asset.storage_path);
        if (asset.tags?.includes("captions") && /\.(mp4|wav)$/.test(asset.storage_path)) {
          paths.push(asset.storage_path.replace(/\.(mp4|wav)$/, ".vtt"));
        }
      }
      if (paths.length) {
        const rm = await supabase.storage.from("media").remove(paths);
        if (rm.error) throw rm.error;
      }
      const { error } = await supabase
        .from("media_assets")
        .delete()
        .eq("id", asset.id)
        .eq("workspace_id", workspace?.id ?? "");
      if (error) throw error;
    },
    // Optimistic: the card disappears immediately, no waiting on the server.
    onMutate: async (asset) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<AssetRow[]>(listKey);
      if (previous) {
        queryClient.setQueryData<AssetRow[]>(
          listKey,
          previous.filter((a) => a.id !== asset.id),
        );
      }
      return { previous };
    },
    onSuccess: (_data, asset) => {
      toast.success("Asset deleted");
      if (workspace?.id) {
        recordAudit({
          data: {
            action: "media.delete",
            entity: "media_assets",
            entityId: asset.id,
            workspaceId: workspace.id,
          },
        }).catch(() => undefined);
      }
    },
    onError: (_error, _asset, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      toast.error("Could not delete the asset.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  const filtered = (assets.data ?? []).filter(
    (a) =>
      (kind === "all" || a.kind === kind) &&
      a.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Media Library"
        description="Generated and uploaded assets are indexed here with folders, tags and search."
      />

      {workspace?.id && (
        <Card className="glass-panel">
          <CardContent className="pt-6">
            <MediaUploader workspaceId={workspace.id} />
          </CardContent>
        </Card>
      )}

      <ModuleStatus
        phase="Coming soon"
        title="Music generation"
        description="There is no music service available yet. For now, upload music you own or have a licence for — it can be used as background music in Video Studio."
        capabilities={["Build background tracks from a mood", "Royalty-safe music library"]}
        requires={["A music generation provider"]}
      />

      <Card className="glass-panel">
        <CardHeader className="gap-3">
          <CardTitle className="text-lg">Assets</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)}>
                  <Badge variant={kind === k ? "default" : "outline"}>{k}</Badge>
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.isLoading ? (
            <CardGridSkeleton className="sm:col-span-2 lg:col-span-3" />
          ) : filtered.length ? (
            filtered.map((a) => (
              <div key={a.id} className="space-y-2 rounded-lg border border-border p-2.5">
                {a.url && a.kind === "video" && (
                  <video
                    controls
                    preload="metadata"
                    crossOrigin="anonymous"
                    className="aspect-video w-full rounded-md bg-muted/30"
                    aria-label={a.name}
                    src={a.url}
                  >
                    {a.captionsUrl && (
                      <track
                        default
                        kind="captions"
                        srcLang="en"
                        label="Captions"
                        src={a.captionsUrl}
                      />
                    )}
                  </video>
                )}
                {a.url && a.kind === "image" && (
                  <img
                    src={a.url}
                    alt={a.name}
                    loading="lazy"
                    className="aspect-video w-full rounded-md object-cover"
                  />
                )}
                {a.url && (a.kind === "audio" || a.kind === "music") && (
                  <audio controls preload="metadata" className="w-full" src={a.url} />
                )}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[a.folder, a.mime_type, a.source].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="outline">{a.kind}</Badge>
                    <ConfirmButton
                      title={`Delete "${a.name}"?`}
                      description="The asset and its stored file are removed permanently. Anything already rendered keeps working."
                      onConfirm={() =>
                        remove.mutate({ id: a.id, storage_path: a.storage_path, tags: a.tags })
                      }
                      trigger={
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive"
                          aria-label="Delete asset"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      }
                    />
                  </div>
                </div>
              </div>
            ))
          ) : assets.data?.length ? (
            <EmptyState
              className="sm:col-span-2 lg:col-span-3"
              icon={Search}
              title="No matches"
              description="Try a different name or clear the filter."
            />
          ) : (
            <EmptyState
              className="sm:col-span-2 lg:col-span-3"
              icon={FolderOpen}
              title="No media yet"
              description="Upload a file or generate assets and they will appear here."
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
