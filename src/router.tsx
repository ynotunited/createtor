import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { RouteErrorComponent } from "./components/AppErrorState";
import { RoutePending } from "./components/RoutePending";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnReconnect: true,
        retry: 1,
        // Surface a first-load failure to the route error boundary so the user
        // gets a real message and a retry, instead of a silently empty screen.
        // Once data is on screen, a failed background refetch must not wipe it.
        throwOnError: (_error, query) => query.state.data === undefined,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // Skeleton while navigating: screens never open blank.
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 150,
    defaultPendingMinMs: 400,
    // Friendly, actionable fallback when a route loader or query throws.
    defaultErrorComponent: RouteErrorComponent,
  });

  return router;
};
