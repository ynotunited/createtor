import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bug,
  Building2,
  Coins,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Plug,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useEffect } from "react";

import { Logo } from "@/components/brand/Logo";
import { SkipLink } from "@/components/SkipLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { AdminPathContext, adminHref } from "@/routes/admin/admin-path-context";
import { adminMe, claimAdmin } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  // Auth is token-based and the token lives in the browser (localStorage), not a
  // cookie. Server functions called from the client send it as a Bearer header,
  // but a full-page SSR request does not — so a `beforeLoad` gate would always
  // fail on the SSR pass and bounce the admin to "/". Gating therefore happens
  // client-side in the component below (and on the server for every API/server
  // function the console actually calls), which matches how the app
  // authenticates. The console document itself contains no data, so rendering
  // its shell before the client check is not a data leak.
  component: AdminLayout,
});

const ADMIN_NAV = [
  { slug: "", label: "Overview", icon: LayoutDashboard },
  { slug: "analytics", label: "Analytics", icon: BarChart3 },
  { slug: "users", label: "Users & Roles", icon: Users },
  { slug: "workspaces", label: "Workspaces", icon: Building2 },
  { slug: "billing", label: "Billing & Plans", icon: CreditCard },
  { slug: "credits", label: "Credits", icon: Coins },
  { slug: "integrations", label: "Integrations", icon: Plug },
  { slug: "audit", label: "Audit Log", icon: ScrollText },
  { slug: "issues", label: "Errors", icon: Bug },
  { slug: "settings", label: "Settings", icon: Settings2 },
  { slug: "profile", label: "Profile", icon: UserCog },
] as const;

/**
 * Builds the public URL for an admin page. The console is mounted internally at
 * `/admin/*`, but the public address is the secret `ADMIN_PATH` when configured,
 * so links are plain anchors to the public path (the server rewrites them to the
 * route tree). Full-page navigation inside a low-traffic console is an
 * acceptable trade for keeping the real path out of the client bundle.
 */

/** Suffix of the current admin page (e.g. "audit"), for active-link matching. */
function adminSlugFromPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return segments.slice(1).join("/");
}

function AdminLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const me = useQuery({
    queryKey: ["admin-me", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => adminMe(),
    retry: false,
    staleTime: 60_000,
  });

  // The secret console path is only returned to admins; fall back to the default
  // while the query is in flight so links never render empty.
  const adminPath = me.data?.adminPath ?? "admin";

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { mode: "signin" } });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (me.data && !me.data.isAdmin && !me.data.needsBootstrap) navigate({ to: "/" });
  }, [me.data, navigate]);

  if (loading || (user && me.isLoading)) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Redirecting to sign in…
      </div>
    );
  }

  if (me.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <ShieldCheck className="size-8 text-muted-foreground" />
        <h1 className="font-display text-xl font-semibold">Admin access required</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {me.error instanceof Error ? me.error.message : "You do not have access to this area."}
        </p>
        <Button variant="secondary" onClick={() => navigate({ to: "/" })}>
          Back to app
        </Button>
      </div>
    );
  }

  if (me.data && !me.data.isAdmin && me.data.needsBootstrap) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo />
        <h1 className="font-display text-2xl font-semibold">Set up the first super admin</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          No administrator exists yet. Claim super admin for <strong>{me.data.email}</strong> to
          enable the control panel. This can only be done once.
        </p>
        {me.data.hasServiceKey === false && (
          <p role="alert" className="max-w-md text-sm text-destructive">
            SUPABASE_SERVICE_ROLE_KEY is missing. Add it to the environment before claiming admin.
          </p>
        )}
        <Button
          disabled={me.data.hasServiceKey === false}
          onClick={async () => {
            await claimAdmin();
            await me.refetch();
          }}
        >
          Claim super admin access
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen overflow-x-clip bg-background">
      <SkipLink />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2 px-5">
          <Link to="/" className="shrink-0">
            <Logo variant="white" className="[&_img]:max-w-[7rem]" />
          </Link>
          <Badge
            variant="secondary"
            className="ml-1 shrink-0 whitespace-nowrap px-1.5 py-0.5 text-[10px] font-medium leading-none"
          >
            {me.data?.isSuperAdmin ? "Super admin" : "Admin"}
          </Badge>
        </div>
        <nav className="flex-1 space-y-1 px-3 pb-8">
          {ADMIN_NAV.map((item) => {
            const current = adminSlugFromPath(pathname);
            const active =
              item.slug === current || (item.slug !== "" && current.startsWith(`${item.slug}/`));
            return (
              <a
                key={item.slug}
                href={adminHref(adminPath, item.slug)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <item.icon className={cn("size-4", active && "text-sidebar-primary")} />
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth", search: { mode: "signin" } });
            }}
          >
            <LogOut className="mr-2 size-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:hidden">
          <a href={adminHref(adminPath, "")}>
            <Logo />
          </a>
          <Badge variant="secondary" className="text-[10px] font-medium leading-none px-1.5 py-0.5">
            {me.data?.isSuperAdmin ? "Super admin" : "Admin"}
          </Badge>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
          {ADMIN_NAV.map((item) => (
            <a
              key={item.slug}
              href={adminHref(adminPath, item.slug)}
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <main
          id="main-content"
          className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-8 sm:px-6"
        >
          <AdminPathContext.Provider value={adminPath}>
            <Outlet />
          </AdminPathContext.Provider>
        </main>
      </div>
    </div>
  );
}
