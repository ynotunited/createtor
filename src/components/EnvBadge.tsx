import { useEffect, useState } from "react";

import { APP_ENV, IS_PRODUCTION } from "@/lib/env.shared";

/**
 * Tiny corner tag that shows which environment the bundle was built for.
 *
 * Rendered only outside production, and only after mount. `IS_PRODUCTION` is
 * baked into each bundle separately, and in dev the SSR bundle can resolve it
 * differently from the client bundle — which shifts DOM positions and causes a
 * hydration mismatch. Gating on mount keeps the server and first client render
 * identical (both empty) so hydration is stable.
 */
export function EnvBadge() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || IS_PRODUCTION) return null;

  return (
    <div className="pointer-events-none fixed bottom-2 left-2 z-50 rounded-md border border-border bg-background/90 px-2 py-0.5 font-mono text-[11px] text-muted-foreground shadow-sm">
      {APP_ENV}
    </div>
  );
}
