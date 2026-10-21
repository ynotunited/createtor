import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Non-blocking offline indicator. Mutations are paused by React Query while
 * offline and replayed on reconnect, so we reassure rather than block.
 *
 * Rendered only after mount: connectivity is unknowable during SSR, so the
 * server and first client render must both be empty to keep hydration stable.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-center text-xs font-medium text-background sm:text-sm"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      You're offline. Changes will sync automatically when you reconnect.
    </div>
  );
}
