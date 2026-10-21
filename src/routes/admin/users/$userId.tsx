import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  Coins,
  FileText,
  Film,
  LogIn,
  Send,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adminGrantCredits,
  adminMe,
  eraseUser,
  exportUserData,
  getUserDetail,
  impersonateUser,
  setUserAdmin,
  setUserSuspended,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/users/$userId")({
  component: AdminUserDetail,
});

/** Triggers a client-side download of a text artefact (report / confirmation). */
function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function AdminUserDetail() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => getUserDetail({ data: { userId } }),
  });

  const viewer = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => adminMe(),
    staleTime: 60_000,
  });

  const [grantWs, setGrantWs] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const toggleAdmin = useMutation({
    mutationFn: (makeAdmin: boolean) => setUserAdmin({ data: { userId, makeAdmin } }),
    onSuccess: (_r, makeAdmin) => {
      toast.success(makeAdmin ? "Admin access granted" : "Admin access removed");
      refetch();
    },
    onError: (e) => toast.error(toUserMessage(e, "Action failed")),
  });

  const suspend = useMutation({
    mutationFn: (suspended: boolean) => setUserSuspended({ data: { userId, suspended } }),
    onSuccess: (_r, suspended) => {
      toast.success(suspended ? "Account suspended" : "Account restored");
      refetch();
    },
    onError: (e) => toast.error(toUserMessage(e, "Action failed")),
  });

  const grant = useMutation({
    mutationFn: () =>
      adminGrantCredits({
        data: {
          workspaceId: grantWs,
          amount: Number(grantAmount),
          reason: grantReason || "Manual admin adjustment",
        },
      }),
    onSuccess: (r) => {
      toast.success(`Balance updated to ${r.balance.toLocaleString()}`);
      setGrantAmount("");
      setGrantReason("");
      refetch();
    },
    onError: (e) => toast.error(toUserMessage(e, "Grant failed")),
  });

  const impersonate = useMutation({
    mutationFn: () => impersonateUser({ data: { userId } }),
    onSuccess: (r) => {
      toast.success("Opening impersonation session in a new tab");
      window.open(r.actionLink, "_blank", "noopener,noreferrer");
    },
    onError: (e) => toast.error(toUserMessage(e, "Impersonation failed")),
  });

  const [confirmEmail, setConfirmEmail] = useState("");
  const erase = useMutation({
    mutationFn: () => eraseUser({ data: { userId, confirmEmail } }),
    onSuccess: (r) => {
      const ref = r.confirmation?.header.reference ?? userId.slice(0, 8);
      downloadText(`removal-confirmation-${ref}.md`, r.confirmationMarkdown ?? "");
      toast.success("User's personal data was erased. Confirmation downloaded.");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void navigate({ to: `/${viewer.data?.adminPath ?? "admin"}/users` });
    },
    onError: (e) => toast.error(toUserMessage(e, "Erase failed")),
  });

  const exportData = useMutation({
    mutationFn: () => exportUserData({ data: { userId } }),
    onSuccess: (r) => {
      downloadText(`data-report-${userId.slice(0, 8)}.md`, r.markdown);
      toast.success("Data report downloaded.");
    },
    onError: (e) => toast.error(toUserMessage(e, "Export failed")),
  });

  if (detail.isLoading || !detail.data) {
    return (
      <>
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </>
    );
  }

  if (detail.isError) {
    return (
      <Card className="glass-panel">
        <CardContent className="py-6 text-sm text-destructive">
          {detail.error instanceof Error ? detail.error.message : "Failed to load user."}
        </CardContent>
      </Card>
    );
  }

  const d = detail.data;
  const name = d.profile?.full_name || d.profile?.email || "Unknown user";
  const validGrant = grantWs && Number.isFinite(Number(grantAmount)) && Number(grantAmount) !== 0;

  return (
    <>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <a href={`/${viewer.data?.adminPath ?? "admin"}/users`} aria-label="Back to users">
            <ArrowLeft className="size-4" />
          </a>
        </Button>
        <PageHeader title={name} description={d.auth.email ?? d.profile?.email ?? "No email"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {d.isSuperAdmin ? (
          <Badge className="gap-1">
            <ShieldCheck className="size-3" /> Super admin
          </Badge>
        ) : d.isAdmin ? (
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="size-3" /> Admin
          </Badge>
        ) : null}
        {d.auth.banned && <Badge variant="destructive">Suspended</Badge>}
        <Badge variant="outline">
          Joined {new Date(d.profile?.created_at ?? Date.now()).toLocaleDateString()}
        </Badge>
        {d.auth.lastSignInAt && (
          <Badge variant="outline">
            Last seen {new Date(d.auth.lastSignInAt).toLocaleDateString()}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Workspaces" value={d.workspaceIds.length} icon={UserRound} />
        <StatCard label="Projects" value={d.counts.projects} icon={Film} />
        <StatCard label="Generations" value={d.counts.jobs} icon={Film} />
        <StatCard label="Published" value={d.counts.published} icon={Send} />
        <StatCard label="Credit balance" value={d.credits.balance.toLocaleString()} icon={Coins} />
        <StatCard
          label="Credits consumed"
          value={d.credits.consumed.toLocaleString()}
          icon={Coins}
        />
        <StatCard label="Connected socials" value={d.counts.socials} icon={Send} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Account actions</CardTitle>
            <CardDescription>All actions are recorded in the audit log.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {viewer.data?.isSuperAdmin && !d.isSuperAdmin && (
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Administrator</p>
                  <p className="text-xs text-muted-foreground">
                    Grant this user access to the admin console.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={d.isAdmin ? "secondary" : "outline"}
                  disabled={toggleAdmin.isPending}
                  onClick={() => toggleAdmin.mutate(!d.isAdmin)}
                >
                  {d.isAdmin ? (
                    <>
                      <ShieldOff className="mr-1.5 size-4" /> Revoke
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-1.5 size-4" /> Grant
                    </>
                  )}
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Suspend account</p>
                <p className="text-xs text-muted-foreground">Blocks all sign-in for this user.</p>
              </div>
              <Button
                size="sm"
                variant={d.auth.banned ? "secondary" : "outline"}
                disabled={suspend.isPending}
                onClick={() => suspend.mutate(!d.auth.banned)}
              >
                <Ban className="mr-1.5 size-4" />
                {d.auth.banned ? "Restore" : "Suspend"}
              </Button>
            </div>
            {viewer.data?.isSuperAdmin && (
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Impersonate</p>
                  <p className="text-xs text-muted-foreground">
                    Opens a one-time sign-in link as this user in a new tab.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={impersonate.isPending}
                  onClick={() => impersonate.mutate()}
                >
                  <LogIn className="mr-1.5 size-4" /> Sign in as
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Export personal data</p>
                <p className="text-xs text-muted-foreground">
                  Downloads a data-subject access report (GDPR Art. 15 / CCPA) as Markdown.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={exportData.isPending}
                onClick={() => exportData.mutate()}
              >
                <FileText className="mr-1.5 size-4" /> Export
              </Button>
            </div>
            {viewer.data?.isSuperAdmin && !d.isSuperAdmin && (
              <div className="flex items-center justify-between rounded-lg border border-destructive/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-destructive">Erase personal data</p>
                  <p className="text-xs text-muted-foreground">
                    Deletes workspaces and content, de-identifies the profile and detaches
                    telemetry. Retains financial records. A removal confirmation is downloaded.
                    Cannot be undone.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={erase.isPending}>
                      <Trash2 className="mr-1.5 size-4" /> Erase
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Erase this user&apos;s personal data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This is permanent. A removal confirmation will be downloaded. Type the
                        user&apos;s email to confirm.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2">
                      <Label htmlFor="erase-email">User email</Label>
                      <Input
                        id="erase-email"
                        value={confirmEmail}
                        onChange={(e) => setConfirmEmail(e.target.value)}
                        placeholder={d.auth.email ?? d.profile?.email ?? ""}
                        autoComplete="off"
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={
                          erase.isPending ||
                          confirmEmail.trim().toLowerCase() !==
                            (d.auth.email ?? d.profile?.email ?? "").toLowerCase()
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          erase.mutate();
                        }}
                      >
                        {erase.isPending ? "Erasing…" : "Erase permanently"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Grant credits</CardTitle>
            <CardDescription>Positive grants; negative amounts deduct.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Workspace</Label>
              {d.workspaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This user owns no workspaces to credit.
                </p>
              ) : (
                <Select value={grantWs} onValueChange={setGrantWs}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {d.workspaces.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} · {w.plan}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="g-amount">Amount</Label>
                <Input
                  id="g-amount"
                  type="number"
                  placeholder="500 or -500"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-reason">Reason</Label>
                <Input
                  id="g-reason"
                  placeholder="Support goodwill"
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                />
              </div>
            </div>
            <Button disabled={!validGrant || grant.isPending} onClick={() => grant.mutate()}>
              <Coins className="mr-2 size-4" /> Apply adjustment
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Owned workspaces</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {d.workspaces.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No owned workspaces.</p>
            ) : (
              <ul className="divide-y divide-border">
                {d.workspaces.map((w) => (
                  <li key={w.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="font-medium">{w.name}</span>
                    <Badge variant="outline" className="capitalize">
                      {w.plan}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {d.audit.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No recorded activity.</p>
            ) : (
              <ul className="divide-y divide-border">
                {d.audit.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="capitalize">{a.action.replace(/_/g, " ")}</span>
                    <time className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
