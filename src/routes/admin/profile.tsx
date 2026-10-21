import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  changePassword as changePasswordFn,
  getMyProfile,
  updateOwnProfile,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/profile")({
  component: AdminProfile,
});

function AdminProfile() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["admin-profile"], queryFn: () => getMyProfile() });

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (profile.data?.fullName) setFullName(profile.data.fullName);
  }, [profile.data?.fullName]);

  const saveName = useMutation({
    mutationFn: () => updateOwnProfile({ data: { fullName: fullName.trim() } }),
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["admin-profile"] });
      queryClient.invalidateQueries({ queryKey: ["admin-me"] });
    },
    onError: (e) => toast.error(toUserMessage(e, "Update failed")),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (password !== confirm) throw new Error("Passwords do not match.");
      await changePasswordFn({ data: { password } });
    },
    onSuccess: () => {
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    },
    onError: (e) => toast.error(toUserMessage(e, "Could not update password")),
  });

  if (profile.isLoading || !profile.data) {
    return (
      <>
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </>
    );
  }

  if (profile.isError) {
    return (
      <Card className="glass-panel">
        <CardContent className="py-6 text-sm text-destructive">
          {profile.error instanceof Error ? profile.error.message : "Failed to load profile."}
        </CardContent>
      </Card>
    );
  }

  const p = profile.data;
  const nameValid = fullName.trim().length > 0 && fullName.trim() !== (p.fullName ?? "");
  const passwordValid = password.length >= 8 && password === confirm;

  return (
    <>
      <PageHeader
        title="Profile"
        description="Your administrator account details and sign-in credentials."
      />

      <div className="flex flex-wrap items-center gap-2">
        {p.isSuperAdmin ? (
          <Badge className="gap-1">
            <ShieldCheck className="size-3" /> Super admin
          </Badge>
        ) : p.isAdmin ? (
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="size-3" /> Admin
          </Badge>
        ) : null}
        {p.createdAt && (
          <Badge variant="outline">Member since {new Date(p.createdAt).toLocaleDateString()}</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserRound className="size-4" /> Account
            </CardTitle>
            <CardDescription>How your name appears across the console.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Full name</Label>
              <Input
                id="p-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-email">Email</Label>
              <Input id="p-email" value={p.email ?? ""} readOnly disabled />
              <p className="text-xs text-muted-foreground">
                The sign-in email cannot be changed from here.
              </p>
            </div>
            <Button disabled={!nameValid || saveName.isPending} onClick={() => saveName.mutate()}>
              Save changes
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="size-4" /> Password
            </CardTitle>
            <CardDescription>Use at least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-pass">New password</Label>
              <Input
                id="p-pass"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-confirm">Confirm password</Label>
              <Input
                id="p-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {confirm.length > 0 && password !== confirm && (
              <p role="alert" className="text-xs text-destructive">
                Passwords do not match.
              </p>
            )}
            <Button
              disabled={!passwordValid || changePassword.isPending}
              onClick={() => changePassword.mutate()}
            >
              Update password
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
