import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_dash/social-accounts")({
  head: () => ({
    meta: [
      { title: "Social Accounts — Createtor" },
      {
        name: "description",
        content:
          "Connect YouTube, TikTok, Instagram, Facebook, X and Threads to schedule and publish automatically.",
      },
      { property: "og:title", content: "Social Accounts — Createtor" },
      { property: "og:description", content: "Connect your publishing destinations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SocialAccounts,
});

type Platform = Database["public"]["Enums"]["platform"];

const PLATFORMS: { platform: Platform; label: string; note: string }[] = [
  { platform: "youtube", label: "YouTube", note: "Long-form uploads, titles, descriptions, tags" },
  { platform: "youtube_shorts", label: "YouTube Shorts", note: "Vertical uploads under 60s" },
  { platform: "tiktok", label: "TikTok", note: "Vertical posts with captions and hashtags" },
  { platform: "instagram", label: "Instagram Reels", note: "Reels with cover and caption" },
  { platform: "facebook", label: "Facebook Reels", note: "Page-published reels" },
  { platform: "x", label: "X", note: "Video posts and text posts" },
  { platform: "threads", label: "Threads", note: "Text and video posts" },
];

function SocialAccounts() {
  const { data: workspace } = useWorkspace();

  const accounts = useQuery({
    queryKey: ["social-accounts", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_accounts")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <PageHeader
        title="Social Accounts"
        description="Publishing uses each platform's official authorisation flow. Passwords are never asked for or stored."
      />

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="size-4 text-primary" /> How connections are kept safe
          </CardTitle>
          <CardDescription>
            Each connection stores only an authorisation token issued by the platform, encrypted at
            rest, with the granted permissions and expiry recorded. You can revoke a connection at
            any time.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PLATFORMS.map((p) => {
          const account = accounts.data?.find(
            (a) => a.platform === p.platform && a.status === "connected",
          );
          return (
            <Card key={p.platform} className="glass-panel">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{p.label}</CardTitle>
                  {accounts.isLoading ? (
                    <Skeleton className="h-5 w-24 rounded-full" />
                  ) : (
                    <Badge variant={account ? "default" : "secondary"}>
                      {account ? "Connected" : "Not connected"}
                    </Badge>
                  )}
                </div>
                <CardDescription>{p.note}</CardDescription>
              </CardHeader>
              <CardContent>
                {accounts.isLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : account ? (
                  <p className="text-sm text-muted-foreground">{account.account_name}</p>
                ) : (
                  <Button variant="secondary" disabled className="w-full">
                    Connect — coming soon
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
