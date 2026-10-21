import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Logo } from "@/components/brand/Logo";
import { SkipLink } from "@/components/SkipLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { adminMe } from "@/lib/admin.functions";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav";
import { navIcon } from "@/lib/nav-icons";
import { setUserTimezone } from "@/lib/profile.functions";
import { detectTimeZone } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dash")({
  component: DashboardLayout,
});

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="space-y-6 px-3 pb-8">
      {NAV_GROUPS.map((group) => (
        <div key={group}>
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/70">
            {group}
          </p>
          <div className="space-y-0.5">
            {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
              const Icon = navIcon(item.icon);
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  {Icon && <Icon className={cn("size-4", active && "text-sidebar-primary")} />}
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function DashboardLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);

  const admin = useQuery({
    queryKey: ["admin-me", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => adminMe(),
    retry: false,
    staleTime: 300_000,
  });

  // Admins operate from the control panel, never the creator app. The console
  // lives at the secret ADMIN_PATH, so use a full navigation to the configured
  // path. The console has its own sign-out, so this is not a trap. Wait until
  // the query has resolved so we never flash the creator UI to an admin.
  useEffect(() => {
    if (admin.data?.isAdmin) {
      window.location.assign(`/${admin.data.adminPath ?? "admin"}`);
    }
  }, [admin.data]);

  const autopilot = useQuery({
    queryKey: ["autopilot-header", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("autopilot_configs")
        .select("enabled")
        .eq("workspace_id", workspace!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.enabled ?? false;
    },
  });

  const profile = useQuery({
    queryKey: ["profile-header", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, timezone")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // One-time backfill: accounts created before time zones were captured (or via
  // an OAuth provider, which supplies none) keep the UTC default. The first time
  // we see such an account in a real browser zone, store it.
  const detectedZone = useMemo(detectTimeZone, []);
  useEffect(() => {
    if (!user?.id) return;
    const stored = profile.data?.timezone;
    if ((stored && stored !== "UTC") || detectedZone === "UTC") return;
    setUserTimezone({ data: { timezone: detectedZone } }).catch(() => undefined);
  }, [user?.id, profile.data?.timezone, detectedZone]);

  const displayName =
    profile.data?.full_name ||
    (typeof user?.user_metadata?.["full_name"] === "string"
      ? user.user_metadata["full_name"]
      : "") ||
    user?.email?.split("@")[0] ||
    "Account";

  if (loading) {
    return (
      <div className="space-y-4 p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-5 text-center">
        <Logo />
        <h1 className="font-display text-xl font-semibold">Sign in to continue</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your workspace, projects and daily queue settings are private to your account.
        </p>
        <Button onClick={() => navigate({ to: "/auth", search: { mode: "signin" } })}>
          Go to sign in
        </Button>
      </div>
    );
  }

  // Admins belong in the control panel, not the creator app. Hold a neutral
  // state while we determine the role (and while redirecting) so the creator
  // shell is never flashed to an admin.
  if (admin.isLoading || admin.data?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {admin.data?.isAdmin ? "Opening the admin console…" : "Loading…"}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen overflow-x-clip bg-background">
      <SkipLink />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link to="/">
            <Logo variant="white" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto bg-sidebar p-0">
                <SheetTitle className="px-5 pt-5">
                  <Logo variant="white" />
                </SheetTitle>
                <div className="mt-4">
                  <NavList onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{workspace?.name ?? "Workspace"}</p>
              <p className="text-xs text-muted-foreground">
                {workspace ? `${workspace.plan} plan` : "Loading workspace…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={autopilot.data ? "default" : "outline"}
              className="hidden sm:inline-flex"
            >
              Queue {autopilot.data ? "on" : "off"}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="max-w-[10rem]">
                  <span className="truncate">{displayName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/billing">Billing</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    // Sign out first, then leave. Navigating before the session is
                    // cleared can bounce the user straight back through the gate.
                    await signOut();
                    navigate({ to: "/" });
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-8 sm:px-6"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
