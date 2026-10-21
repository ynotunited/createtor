import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listErrorIssues, updateErrorIssueStatus } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/issues")({
  component: AdminIssues,
});

const FILTERS = ["open", "resolved", "ignored", "all"] as const;
type Filter = (typeof FILTERS)[number];

function AdminIssues() {
  const [status, setStatus] = useState<Filter>("open");
  const queryClient = useQueryClient();

  const issues = useQuery({
    queryKey: ["admin-issues", status],
    queryFn: () => listErrorIssues({ data: { status, limit: 100 } }),
  });

  type IssueRow = NonNullable<typeof issues.data>[number];

  const setStatusMutation = useMutation({
    mutationFn: (vars: { id: string; status: "open" | "resolved" | "ignored" }) =>
      updateErrorIssueStatus({ data: vars }),
    // Optimistic: the row leaves the filtered list immediately, no server wait.
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["admin-issues"] });
      const key = ["admin-issues", status];
      const previous = queryClient.getQueryData<IssueRow[]>(key);
      if (previous && status !== "all") {
        queryClient.setQueryData<IssueRow[]>(
          key,
          previous.filter((issue) => issue.id !== vars.id),
        );
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["admin-issues", status], context.previous);
      toast.error(toUserMessage(error, "Update failed"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-issues"] });
    },
  });

  return (
    <>
      <PageHeader
        title="Error tracking"
        description="Deduplicated exceptions captured from the server and browser, newest first. Counts rise as the same fingerprint recurs."
      />

      <div className="inline-flex rounded-lg border border-border p-0.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatus(f)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm capitalize transition-colors",
              status === f
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <Card className="glass-panel">
        <CardContent className="p-0">
          {issues.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : issues.isError || !issues.data ? (
            <p className="p-5 text-sm text-destructive">
              {issues.error instanceof Error ? issues.error.message : "Failed to load issues."}
            </p>
          ) : issues.data.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No issues in this view.</p>
          ) : (
            <ul className="divide-y divide-border">
              {issues.data.map((issue) => (
                <li key={issue.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={issue.level === "error" ? "destructive" : "secondary"}
                      className="capitalize"
                    >
                      {issue.level}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {issue.kind}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {issue.count.toLocaleString()}× · last{" "}
                      {new Date(issue.last_seen).toLocaleString()}
                    </span>
                    <span className="ml-auto flex gap-2">
                      {issue.status !== "resolved" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={setStatusMutation.isPending}
                          onClick={() =>
                            setStatusMutation.mutate({ id: issue.id, status: "resolved" })
                          }
                        >
                          Resolve
                        </Button>
                      )}
                      {issue.status === "open" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={setStatusMutation.isPending}
                          onClick={() =>
                            setStatusMutation.mutate({ id: issue.id, status: "ignored" })
                          }
                        >
                          Ignore
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={setStatusMutation.isPending}
                          onClick={() => setStatusMutation.mutate({ id: issue.id, status: "open" })}
                        >
                          Reopen
                        </Button>
                      )}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm">{issue.message}</p>
                  {issue.path && (
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {issue.path}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
