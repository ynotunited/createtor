/**
 * Machine-readable data map.
 *
 * The classification of every table that can reference a person, used by the
 * erasure routine and the GDPR data report. `data-map.test.ts` parses the
 * migrations and fails if a table that references a user or workspace is not
 * classified here, so this cannot silently drift from the schema.
 *
 * Keep this in sync with `docs/data-map.md`.
 */

export type DataClass = "anchor" | "cascade" | "detach" | "retain" | "operational";

export type TableClassification = {
  table: string;
  class: DataClass;
  /** Short human note for the data report / docs. */
  note: string;
};

/** Anchor: the identity anchors themselves. */
export const ANCHOR_TABLES: TableClassification[] = [
  { table: "profiles", class: "anchor", note: "The user's profile row (de-identified on erase)." },
  {
    table: "workspaces",
    class: "anchor",
    note: "The tenant owned by the user (deleted on erase).",
  },
];

/** User-anchored tables, keyed by user_id (the person, not the tenant). */
export const USER_TABLES: TableClassification[] = [
  { table: "user_roles", class: "detach", note: "Role grants (deleted on erase)." },
  { table: "workspace_members", class: "detach", note: "Membership rows (deleted on erase)." },
  {
    table: "checkout_intents",
    class: "detach",
    note: "Checkout idempotency rows (deleted on erase).",
  },
  {
    table: "security_events",
    class: "detach",
    note: "Security telemetry (detached + metadata blanked).",
  },
  {
    table: "analytics_events",
    class: "detach",
    note: "Product analytics (detached + props blanked).",
  },
  { table: "error_issues", class: "detach", note: "Error tracking (detached + metadata blanked)." },
  {
    table: "audit_logs",
    class: "detach",
    note: "Audit trail (detached; owned-workspace rows cascade).",
  },
];

/** Workspace-anchored tables that cascade when the owned workspace is deleted. */
export const WORKSPACE_TABLES: string[] = [
  "channels",
  "subscriptions",
  "usage_credits",
  "credit_transactions",
  "content_ideas",
  "research_topics",
  "scripts",
  "characters",
  "voices",
  "projects",
  "scenes",
  "media_assets",
  "video_jobs",
  "render_jobs",
  "social_accounts",
  "scheduled_posts",
  "published_posts",
  "analytics",
  "templates",
  "autopilot_configs",
  "notifications",
  "content_feedback",
];

/** Tables deliberately kept for legal/financial or operational reasons. */
export const RETAINED_TABLES: TableClassification[] = [
  {
    table: "payment_ledger",
    class: "retain",
    note: "Append-only financial ledger; no direct identifier retained.",
  },
  {
    table: "payment_events",
    class: "retain",
    note: "Provider webhook records; retained for finance/audit.",
  },
  {
    table: "rate_limits",
    class: "operational",
    note: "Limiter counters keyed by a salted hash; purged by retention, not erasure.",
  },
  {
    table: "system_settings",
    class: "operational",
    note: "Platform configuration; no personal data.",
  },
];

/** Every table name the map knows about (used by the completeness test). */
export function classifiedTables(): Set<string> {
  return new Set<string>([
    ...ANCHOR_TABLES.map((t) => t.table),
    ...USER_TABLES.map((t) => t.table),
    ...WORKSPACE_TABLES,
    ...RETAINED_TABLES.map((t) => t.table),
  ]);
}
