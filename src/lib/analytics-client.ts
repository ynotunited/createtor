/**
 * Fire-and-forget product analytics from the browser. Safe to call anywhere;
 * no-ops during SSR and swallows all failures so tracking can never break the
 * UI.
 */

import { track } from "@/lib/observability.functions";
import { maskEventProps } from "@/lib/privacy";

export function trackClient(
  event: string,
  props?: Record<string, unknown>,
  workspaceId?: string,
): void {
  if (typeof window === "undefined") return;
  const masked = maskEventProps(props);
  track({
    data: {
      event,
      ...(masked ? { props: masked } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      path: window.location.pathname,
    },
  }).catch(() => undefined);
}
