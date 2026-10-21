/**
 * Append-only audit trail for sensitive actions. Every security-relevant,
 * destructive or money-touching operation should leave a row here, written with
 * the service role (clients can never insert — see migration 0012).
 *
 * Writes are best-effort: an audit outage must never break the action it is
 * recording, so failures are logged and swallowed rather than thrown.
 */

import type { Database } from "@/integrations/supabase/types";
import { hashIp, redactMetadata } from "@/lib/redact";

type AuditMetadata = Database["public"]["Tables"]["audit_logs"]["Row"]["metadata"];

export type AuditEvent = {
  actorId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

const MAX_METADATA_BYTES = 4_096;
const MAX_STRING_LENGTH = 1_000;

function sanitizeMetadata(input: Record<string, unknown> | undefined): AuditMetadata {
  // Deep-redact first (emails, card-like runs, IP-ish values) so raw PII never
  // reaches the row, then bound size/length.
  const merged: Record<string, unknown> = redactMetadata(input);
  try {
    const json = JSON.stringify(merged, (_key, value) => {
      if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
        return `${value.slice(0, MAX_STRING_LENGTH)}…`;
      }
      return value;
    });
    if (!json) return {};
    if (json.length > MAX_METADATA_BYTES) {
      return { truncated: true, originalBytes: json.length } as AuditMetadata;
    }
    return JSON.parse(json) as AuditMetadata;
  } catch {
    return { unserializable: true } as AuditMetadata;
  }
}

export async function auditEvent(event: AuditEvent): Promise<void> {
  try {
    // Store a salted pseudonym instead of the raw IP; the value lands under the
    // `ip` key so dashboards that expect it keep working.
    const ipHash = await hashIp(event.ip, process.env["IP_HASH_SALT"]);
    const metadata = sanitizeMetadata({
      ...event.metadata,
      ...(ipHash ? { ip: ipHash } : {}),
      ...(event.userAgent ? { userAgent: event.userAgent } : {}),
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      user_id: event.actorId ?? null,
      action: event.action,
      entity: event.entity ?? null,
      entity_id: event.entityId ?? null,
      workspace_id: event.workspaceId ?? null,
      metadata,
    });
    if (error) {
      console.error(`[audit] insert failed for ${event.action}: ${error.message}`);
    }
  } catch (error) {
    console.error(
      `[audit] could not record ${event.action}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
