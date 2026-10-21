import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown by the router while a route's data/code is loading, so a screen never
 * opens blank during navigation. Kept layout-neutral so it fits both the
 * marketing pages and the dashboard shell.
 */
export function RoutePending() {
  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-6 px-4 py-10 sm:px-6"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-9 w-56 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
