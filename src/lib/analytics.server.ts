/**
 * Product analytics events.
 *
 * Records bounded, non-sensitive usage events into `analytics_events` for
 * funnels and retention. This is deliberately not a third-party SDK: no cookies
 * beyond what the app already sets, no cross-site tracking, no client script.
 *
 * Never throws and never stores PII: pass opaque ids and small props only.
 */

import type { Json } from "@/integrations/supabase/types";
import { maskEventProps } from "@/lib/privacy";

const MAX_EVENT = 64;
const MAX_PATH = 512;
const MAX_PROPS_BYTES = 2_048;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_TABLE_CODES = new Set(["PGRST202", "42883", "42P01"]);

/** Event names are lower-case, dot-namespaced, e.g. "auth.signin". */
const EVENT_RE = /^[a-z0-9_.-]{1,64}$/;

export type AnalyticsInput = {
  event: string;
  path?: string | null;
  workspaceId?: string | null;
  userId?: string | null;
  props?: Record<string, unknown>;
};

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function boundedProps(props: Record<string, unknown> | undefined): Json {
  try {
    const json = JSON.stringify(props ?? {});
    if (json.length <= MAX_PROPS_BYTES) return JSON.parse(json) as Json;
  } catch {
    // Circular/unserializable.
  }
  return { truncated: true };
}

/** Best-effort event write. Validates the event name and drops junk silently. */
export async function trackEvent(input: AnalyticsInput): Promise<void> {
  const event = bounded(input.event, MAX_EVENT);
  if (!event || !EVENT_RE.test(event)) return;
  // Drop sensitive keys and non-primitive values so no credential or form
  // value can ever reach the events table.
  const safeProps = maskEventProps(input.props);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("analytics_events").insert({
      event,
      path: bounded(input.path, MAX_PATH),
      workspace_id: uuidOrNull(input.workspaceId),
      user_id: uuidOrNull(input.userId),
      props: boundedProps(safeProps),
    });
    if (error && !MISSING_TABLE_CODES.has(error.code ?? "")) {
      console.error(`[analytics] insert failed: ${error.message}`);
    }
  } catch (error) {
    console.error(
      `[analytics] track failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
