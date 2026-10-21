import { createFileRoute } from "@tanstack/react-router";

import { ModuleStatus } from "@/components/dashboard/ModuleStatus";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_dash/repurpose")({
  head: () => ({
    meta: [
      { title: "Repurpose — Createtor" },
      {
        name: "description",
        content:
          "Turn one long video into shorts, reels, TikToks, quote clips, teasers and social posts.",
      },
      { property: "og:title", content: "Repurpose — Createtor" },
      { property: "og:description", content: "Content repurposing engine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Repurpose,
});

const OUTPUTS = [
  ["Shorts", "9:16 cut with a new hook and captions"],
  ["Reels", "Instagram-native pacing and metadata"],
  ["TikToks", "Trend-aware opening beat"],
  ["Quote clips", "Strongest single statement, framed"],
  ["Teasers", "Curiosity cut that points to the full video"],
  ["Social posts", "Text posts for X and Threads"],
];

function Repurpose() {
  return (
    <>
      <PageHeader
        title="Repurpose"
        description="Upload or select an existing video and let the system find the strongest moments."
      />

      <ModuleStatus
        phase="Coming soon"
        title="Moment detection and clipping"
        description="Repurposing needs transcription for word timings plus the render queue to cut and re-frame clips."
        capabilities={[
          "Automatic strongest-moment detection",
          "Vertical reframing with subject tracking",
          "Per-platform hooks and metadata",
          "Batch export of every clip type",
        ]}
        requires={[
          "Transcription provider connection",
          "Render queue capacity for your plan",
          "Source video in the media library",
        ]}
      />

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">What one video becomes</CardTitle>
          <CardDescription>
            Each output keeps its own hook, caption style and metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OUTPUTS.map(([title, body]) => (
            <div key={title} className="rounded-lg border border-border px-3 py-3">
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
