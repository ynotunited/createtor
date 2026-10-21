import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listAuditLogs, listSecurityEvents } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/audit")({
  component: AdminAudit,
});

function AdminAudit() {
  const logs = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => listAuditLogs({ data: { limit: 200 } }),
  });

  const security = useQuery({
    queryKey: ["admin-security-events"],
    queryFn: () => listSecurityEvents({ data: { limit: 100 } }),
  });

  return (
    <>
      <PageHeader
        title="Security & audit"
        description="Immutable record of privileged admin actions, plus abuse and security signals captured at the edge."
      />

      <Card className="glass-panel">
        <CardContent className="p-0">
          {logs.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.isError || !logs.data ? (
            <p className="p-5 text-sm text-destructive">
              {logs.error instanceof Error ? logs.error.message : "Failed to load audit log."}
            </p>
          ) : logs.data.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Action
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Entity
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Metadata
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.data.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap px-5 py-3 font-medium capitalize">
                        {log.action.replace(/_/g, " ")}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                        {log.entity ?? "-"}
                      </td>
                      <td className="max-w-md truncate px-5 py-3 text-muted-foreground">
                        {log.metadata ? JSON.stringify(log.metadata) : "-"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Security events</h2>
          <p className="text-sm text-muted-foreground">
            Rate limit trips, invalid webhook signatures, denied auth and plaintext requests. Stored
            per kind and IP, capped at 30 events per minute.
          </p>
        </div>

        <Card className="glass-panel">
          <CardContent className="p-0">
            {security.isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : security.isError || !security.data ? (
              <p className="p-5 text-sm text-destructive">
                {security.error instanceof Error
                  ? security.error.message
                  : "Failed to load security events."}
              </p>
            ) : security.data.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No security events recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">
                        Kind
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        IP
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        Path
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        Metadata
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        When
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {security.data.map((event) => (
                      <tr key={event.id}>
                        <td className="whitespace-nowrap px-5 py-3 font-medium">
                          {event.kind.replace(/_/g, " ")}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted-foreground">
                          {event.ip ?? "-"}
                        </td>
                        <td className="max-w-xs truncate px-5 py-3 font-mono text-xs text-muted-foreground">
                          {event.path ?? "-"}
                        </td>
                        <td className="max-w-md truncate px-5 py-3 text-muted-foreground">
                          {event.metadata ? JSON.stringify(event.metadata) : "-"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                          {new Date(event.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
