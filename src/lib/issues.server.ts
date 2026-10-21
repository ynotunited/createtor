/**
 * Error/issue tracking.
 *
 * Worker logs are ephemeral, so a caught error disappears once the isolate
 * recycles. `captureIssue` fingerprints an error and upserts it into
 * `error_issues` (dedupe by fingerprint, running count, first/last seen) so
 * recurring failures are visible and countable after the fact.
 *
 * Constraints:
 * - Never throws: capturing telemetry must not change the response to a user.
 * - Never stores secrets: only a bounded message/stack and small metadata.
 * - Degrades quietly before the migration (0020) is applied.
 */

import type { Json } from "@/integrations/supabase/types";
import { log } from "@/lib/logger.server";
import { redactMetadata, redactText } from "@/lib/redact";

const MAX_MESSAGE = 1_000;
const MAX_STACK = 8_000;
const MAX_PATH = 512;
const MAX_RELEASE = 64;
const MAX_METADATA_BYTES = 2_048;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883", "42P01"]);

export type IssueKind = "server" | "client" | "webhook" | "job";
export type IssueLevel = "error" | "warning" | "info";

export type IssueContext = {
  kind?: IssueKind;
  level?: IssueLevel;
  path?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  release?: string | null;
  metadata?: Record<string, unknown>;
};

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function boundedMetadata(metadata: Record<string, unknown> | undefined): Json {
  // Deep-redact caller metadata (emails, card-like runs, network-ish keys).
  const redacted = redactMetadata(metadata);
  try {
    const json = JSON.stringify(redacted);
    if (json.length <= MAX_METADATA_BYTES) return JSON.parse(json) as Json;
  } catch {
    // Circular/unserializable — fall through to the marker.
  }
  return { truncated: true };
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

/** Strips line numbers and absolute URLs so the same bug fingerprints alike. */
function normaliseStack(stack: string | undefined): string {
  if (!stack) return "";
  return stack
    .split("\n")
    .slice(0, 4)
    .join("\n")
    .replace(/https?:\/\/[^\s)]+/g, "")
    .replace(/:\d+:\d+/g, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable identity for an error: kind + normalised stack + first message line. */
export async function fingerprintError(
  error: Error,
  kind: IssueKind,
  path: string | null,
): Promise<string> {
  const firstLine = (error.message || String(error)).split("\n")[0] ?? "";
  return sha256Hex(`${kind}|${normaliseStack(error.stack)}|${firstLine}|${path ?? ""}`);
}

/**
 * Fingerprints and records an error occurrence. Best-effort and idempotent per
 * fingerprint; resolves when the write attempt finishes and never rejects.
 */
export async function captureIssue(error: unknown, ctx: IssueContext = {}): Promise<void> {
  try {
    const err = toError(error);
    const kind = ctx.kind ?? "server";
    const level = ctx.level ?? "error";
    const path = bounded(ctx.path, MAX_PATH);
    const fingerprint = await fingerprintError(err, kind, path);
    // Redact before storing or logging: error text routinely echoes an email or
    // an id, and this path is reachable from the browser (reportClientError).
    const safeMessage =
      bounded(redactText(err.message || String(error)), MAX_MESSAGE) ?? "Unknown error";
    const safeStack = bounded(err.stack ? redactText(err.stack) : null, MAX_STACK);

    log("error", "issue.captured", {
      fingerprint,
      kind,
      level,
      path,
      message: bounded(redactText(err.message), MAX_MESSAGE),
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: rpcError } = await supabaseAdmin.rpc("record_error_issue", {
      _fingerprint: fingerprint,
      _kind: kind,
      _level: level,
      _message: safeMessage,
      _stack: safeStack,
      _path: path,
      _user_id: uuidOrNull(ctx.userId),
      _workspace_id: uuidOrNull(ctx.workspaceId),
      _release: bounded(ctx.release, MAX_RELEASE),
      _metadata: boundedMetadata(ctx.metadata),
    });
    if (rpcError && !MISSING_FUNCTION_CODES.has(rpcError.code ?? "")) {
      console.error(`[issues] record failed: ${rpcError.message}`);
    }
  } catch (inner) {
    console.error(
      `[issues] capture failed: ${inner instanceof Error ? inner.message : String(inner)}`,
    );
  }
}
