import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listWorkspaces, updateWorkspace } from "@/lib/admin.functions";
import { PLANS } from "@/lib/pricing";

export const Route = createFileRoute("/admin/workspaces")({
  component: AdminWorkspaces,
});

type WorkspacePatch = {
  workspaceId: string;
  plan?: "free" | "creator" | "pro" | "agency";
  whiteLabel?: boolean;
  suspended?: boolean;
  suspensionReason?: string | null;
};

function AdminWorkspaces() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const queryClient = useQueryClient();

  const workspaces = useQuery({
    queryKey: ["admin-workspaces", term],
    queryFn: () => listWorkspaces({ data: { search: term || undefined, limit: 100 } }),
  });

  const update = useMutation({
    mutationFn: (vars: WorkspacePatch) => updateWorkspace({ data: vars }),
    onSuccess: () => {
      toast.success("Workspace updated");
      queryClient.invalidateQueries({ queryKey: ["admin-workspaces"] });
    },
    onError: (error) => toast.error(toUserMessage(error, "Update failed")),
  });

  return (
    <>
      <PageHeader
        title="Workspaces"
        description="Change plans, suspend abuse, and inspect credits across every workspace."
      />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(search.trim());
        }}
      >
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search workspaces by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <Card className="glass-panel">
        <CardContent className="p-0">
          {workspaces.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : workspaces.isError || !workspaces.data ? (
            <p className="p-5 text-sm text-destructive">
              {workspaces.error instanceof Error
                ? workspaces.error.message
                : "Failed to load workspaces."}
            </p>
          ) : workspaces.data.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No workspaces found.</p>
          ) : (
            <ul className="divide-y divide-border">
              {workspaces.data.map((ws) => (
                <li key={ws.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{ws.name}</p>
                      {ws.suspended && <Badge variant="destructive">Suspended</Badge>}
                      {ws.whiteLabel && <Badge variant="outline">White label</Badge>}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {ws.ownerName || ws.ownerEmail || "Unknown owner"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ws.balance.toLocaleString()} credits · {ws.consumed.toLocaleString()} used ·{" "}
                      {ws.projects} project{ws.projects === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={ws.plan}
                      onValueChange={(plan) =>
                        update.mutate({
                          workspaceId: ws.id,
                          plan: plan as "free" | "creator" | "pro" | "agency",
                        })
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLANS.map((plan) => (
                          <SelectItem key={plan.key} value={plan.key}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant={ws.suspended ? "secondary" : "outline"}
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({
                          workspaceId: ws.id,
                          suspended: !ws.suspended,
                          suspensionReason: ws.suspended ? null : "Suspended by administrator",
                        })
                      }
                    >
                      {ws.suspended ? "Restore" : "Suspend"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
