import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Plug, CheckCircle2, XCircle } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listIntegrations } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/integrations")({
  component: AdminIntegrations,
});

function AdminIntegrations() {
  const integrations = useQuery({
    queryKey: ["admin-integrations"],
    queryFn: () => listIntegrations(),
  });

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Social publishing connections across every workspace. API providers live under AI & Platform."
      />

      {integrations.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : integrations.isError || !integrations.data ? (
        <Card className="glass-panel">
          <CardContent className="py-6 text-sm text-destructive">
            {integrations.error instanceof Error
              ? integrations.error.message
              : "Failed to load integrations."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Connected accounts"
              value={integrations.data.totalConnected}
              icon={Plug}
            />
            <StatCard
              label="Providers in use"
              value={integrations.data.platforms.filter((p) => p.total > 0).length}
              icon={CheckCircle2}
            />
            <StatCard
              label="Tokens expiring (7d)"
              value={integrations.data.platforms.reduce((n, p) => n + p.expiring, 0)}
              icon={AlertTriangle}
            />
          </div>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-lg">Providers</CardTitle>
              <CardDescription>Connection state per social platform.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {integrations.data.platforms.map((p) => (
                <div key={p.platform} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{p.label}</p>
                    {p.expiring > 0 && (
                      <Badge variant="destructive">
                        <AlertTriangle className="mr-1 size-3" />
                        {p.expiring}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <CheckCircle2 className="size-4 text-[var(--color-brand-tertiary)]" />
                      {p.connected}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <XCircle className="size-4" />
                      {p.disconnected}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-lg">Connections</CardTitle>
              <CardDescription>Most recent account connections.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {integrations.data.connections.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No accounts connected yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Account
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Platform
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Workspace
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Status
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Connected
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {integrations.data.connections.map((c) => (
                        <tr key={c.id}>
                          <td className="px-5 py-3 font-medium">{c.accountName ?? "-"}</td>
                          <td className="px-5 py-3 text-muted-foreground">{c.platform}</td>
                          <td className="px-5 py-3 text-muted-foreground">{c.workspaceName}</td>
                          <td className="px-5 py-3">
                            <Badge variant={c.status === "connected" ? "secondary" : "outline"}>
                              {c.status}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                            {c.connectedAt ? new Date(c.connectedAt).toLocaleDateString() : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
