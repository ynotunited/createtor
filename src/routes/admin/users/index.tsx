import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminHref } from "@/routes/admin/admin-path-context";
import { findDuplicateUsers, listUsers } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/users/")({
  component: AdminUsers,
});

function AdminUsers() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const adminHref = useAdminHref();

  const users = useQuery({
    queryKey: ["admin-users", term],
    queryFn: () => listUsers({ data: { search: term || undefined, limit: 100 } }),
  });

  const duplicates = useQuery({
    queryKey: ["admin-duplicate-users"],
    queryFn: () => findDuplicateUsers(),
  });

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Every account on the platform. Open a user to review activity or suspend the account."
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
            placeholder="Search by email or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {duplicates.data && duplicates.data.length > 0 && (
        <Card className="glass-panel border-destructive/40">
          <CardContent className="space-y-3 p-5">
            <div>
              <h2 className="text-sm font-semibold">Potential duplicate accounts</h2>
              <p className="text-xs text-muted-foreground">
                Profiles sharing an email after normalising case and whitespace. Detected with a
                window function (no GROUP BY).
              </p>
            </div>
            <ul className="divide-y divide-border text-sm">
              {duplicates.data.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {d.full_name || d.email}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {d.normalized_email}
                    </span>
                  </span>
                  <Badge variant="destructive">{d.duplicate_count}×</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="glass-panel">
        <CardContent className="p-0">
          {users.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : users.isError || !users.data ? (
            <p className="p-5 text-sm text-destructive">
              {users.error instanceof Error ? users.error.message : "Failed to load users."}
            </p>
          ) : users.data.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No users found.</p>
          ) : (
            <ul className="divide-y divide-border">
              {users.data.map((user) => {
                const isSuperAdmin = user.roles.includes("super_admin");
                const isAdmin = isSuperAdmin || user.roles.includes("admin");
                return (
                  <li key={user.id}>
                    <a
                      href={adminHref(`users/${user.id}`)}
                      className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{user.fullName || user.email}</p>
                          {isSuperAdmin ? (
                            <Badge className="gap-1">
                              <ShieldCheck className="size-3" /> Super admin
                            </Badge>
                          ) : isAdmin ? (
                            <Badge variant="secondary" className="gap-1">
                              <ShieldCheck className="size-3" /> Admin
                            </Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.workspaces} workspace{user.workspaces === 1 ? "" : "s"} · joined{" "}
                          {new Date(user.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
