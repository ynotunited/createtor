/**
 * Durable security telemetry.
 *
 * `logSecurity` only reaches the Worker console, which is ephemeral. This module
 * also writes high-signal events to `security_events` so admins can review them
 * after the fact (and so alerting can query them).
 *
 * Design constraints:
 * - Never throw: telemetry must not break a request or a webhook.
 * - Never block the response: callers pass the promise to `ctx.waitUntil` when
 *   they have a Worker context, or await it on already-async paths.
 * - Bounded storage: an attacker hammering an endpoint must not turn a 429 storm
 *   into an unbounded insert storm. A dedicated limiter key caps persisted
 *   events per kind+IP per window, and persists nothing if that gate fails.
 * - No secrets: only routing metadata is stored; callers must never pass
 *   headers, tokens, cookies, query strings or bodies.
 */

import type { Json } from "@/integrations/supabase/types";
import { logSecurity, type LogFields } from "@/lib/logger.server";
import { consumeRateLimit } from "@/lib/rate-limit-core.server";
import { hashIp, redactMetadata, redactText } from "@/lib/redact";

const MAX_KIND = 64;
const MAX_PATH = 512;
const MAX_UA = 200;
const MAX_METADATA_BYTES = 2048;

/** Persisted-event budget per kind+IP. */
const STORE_LIMIT = 30;
const STORE_WINDOW_SECONDS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SecurityEventFields = LogFields & {
  ip?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  path?: string | null;
  ua?: string | null;
};

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

/** Keeps only caller-supplied extras; drops the columns extracted separately. */
function boundedMetadata(fields: SecurityEventFields): Json {
  const {
    ip: _ip,
    userId: _userId,
    workspaceId: _workspaceId,
    path: _path,
    ua: _ua,
    ...rest
  } = fields;
  // Deep-redact caller extras (emails, card-like runs, IP-ish keys such as the
  // raw-IP `subject` some rate-limit paths pass) before serializing.
  const redacted = redactMetadata(rest);
  try {
    const json = JSON.stringify(redacted);
    // Round-trip so the value is guaranteed to satisfy `Json`.
    if (json.length <= MAX_METADATA_BYTES) return JSON.parse(json) as Json;
  } catch {
    // Fall through to the truncated marker for circular/unserializable values.
  }
  return { truncated: true };
}

/**
 * Logs the event immediately and best-effort persists it. Resolves when the
 * persistence attempt finishes; never rejects.
 */
export async function recordSecurityEvent(
  kind: string,
  fields: SecurityEventFields = {},
): Promise<void> {
  const safeKind = boundedString(kind, MAX_KIND) ?? "unknown";
  // Redact before the value ever reaches the log drain: logs are retained by the
  // host and must not carry raw IPs or inline PII either.
  logSecurity(safeKind, redactMetadata(fields) as LogFields);

  try {
    const ipHash = await hashIp(fields.ip, process.env["IP_HASH_SALT"]);
    const decision = await consumeRateLimit(
      `security_store:${safeKind}:${ipHash ?? "unknown"}`,
      STORE_LIMIT,
      STORE_WINDOW_SECONDS,
    );
    if (decision !== "allowed") return;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("security_events").insert({
      kind: safeKind,
      ip: ipHash,
      user_id: uuidOrNull(fields.userId),
      workspace_id: uuidOrNull(fields.workspaceId),
      path: boundedString(fields.path, MAX_PATH)
        ? redactText(boundedString(fields.path, MAX_PATH)!)
        : null,
      user_agent: boundedString(fields.ua, MAX_UA),
      metadata: boundedMetadata(fields),
    });
    if (error) console.error(`[security-events] insert failed: ${error.message}`);
  } catch (error) {
    console.error(
      `[security-events] persist failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
