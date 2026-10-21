import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";
import { updateOwnProfile } from "@/lib/profile.functions";
import { PROVIDER_REGISTRY } from "@/lib/providers/types";
import { detectTimeZone, isValidTimeZone, listTimeZones } from "@/lib/schedule";

export const Route = createFileRoute("/_dash/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Createtor" },
      {
        name: "description",
        content:
          "Your profile, workspace details and the status of every connected generation provider.",
      },
      { property: "og:title", content: "Settings — Createtor" },
      { property: "og:description", content: "Account, workspace and provider settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { user, signOut } = useAuth();
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [timezone, setTimezone] = useState(detectTimeZone);
  const [confirmEmail, setConfirmEmail] = useState("");
  const zones = useMemo(() => listTimeZones(), []);

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile.data?.full_name) setFullName(profile.data.full_name);
  }, [profile.data]);

  useEffect(() => {
    if (profile.data?.timezone) setTimezone(profile.data.timezone);
  }, [profile.data]);

  useEffect(() => {
    if (workspace?.name) setWorkspaceName(workspace.name);
  }, [workspace?.name]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      await updateOwnProfile({
        data: {
          fullName,
          timezone: isValidTimeZone(timezone) ? timezone : "UTC",
        },
      });
    },
    onSuccess: () => {
      toast.success("Profile saved");
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save your profile."),
  });

  const saveWorkspace = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("workspaces")
        .update({ name: workspaceName })
        .eq("id", workspace!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Workspace saved");
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: () => toast.error("Could not save the workspace."),
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      await deleteMyAccount();
    },
    onSuccess: async () => {
      toast.success("Your account and personal data were deleted.");
      await signOut();
      void navigate({ to: "/" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not delete your account."),
  });

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your account, your workspace and the current status of every generation provider."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Your account</CardTitle>
            <CardDescription>{user?.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tz">Time zone</Label>
                  <Input
                    id="tz"
                    list="timezone-options"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="Africa/Lagos"
                    autoComplete="off"
                  />
                  <datalist id="timezone-options">
                    {zones.map((zone) => (
                      <option key={zone} value={zone} />
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground">
                    Sets the local clock for every scheduled post and reminder.
                  </p>
                </div>
              </>
            )}
            <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending || !user}>
              <Save className="mr-1.5 size-4" /> Save profile
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Workspace</CardTitle>
            <CardDescription>
              Plan: {workspace?.plan ?? "free"}. Team seats and client workspaces arrive with the
              Agency plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="ws">Workspace name</Label>
              <Input
                id="ws"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
              />
            </div>
            <Button
              onClick={() => saveWorkspace.mutate()}
              disabled={saveWorkspace.isPending || !workspace}
            >
              <Save className="mr-1.5 size-4" /> Save workspace
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Generation providers</CardTitle>
          <CardDescription>
            Writing features (ideas, research, scripts, storyboards, metadata, insights) are live.
            Media generation activates as each provider below is connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {PROVIDER_REGISTRY.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.note}</p>
              </div>
              <Badge variant={p.status === "connected" ? "default" : "secondary"}>
                {p.status === "connected" ? "Connected" : "Not connected"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass-panel border-destructive/40">
        <CardHeader>
          <CardTitle className="text-lg text-destructive">Delete account</CardTitle>
          <CardDescription>
            Permanently erase your account and personal data. This removes your workspaces and their
            content, de-identifies your profile, and detaches your activity from analytics, error
            and security records. Financial records required by law are retained. This cannot be
            undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={!user}>
                <Trash2 className="mr-1.5 size-4" /> Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This is permanent and cannot be undone. Type your account email to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="confirm-email">Account email</Label>
                <Input
                  id="confirm-email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder={user?.email ?? ""}
                  autoComplete="off"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={
                    deleteAccount.isPending ||
                    confirmEmail.trim().toLowerCase() !== (user?.email ?? "").toLowerCase()
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    deleteAccount.mutate();
                  }}
                >
                  {deleteAccount.isPending ? "Deleting…" : "Delete permanently"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </>
  );
}
