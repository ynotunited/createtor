#!/usr/bin/env node
// Post-migration verification. Run this against staging (and then production)
// right after `migrate.mjs apply` and before any deploy. It asserts that the
// expected schema objects exist with the expected shape. Exit code is 1 on any
// failure, so it can gate a pipeline.
//
// Usage: node scripts/db/verify.mjs
// Connection: MIGRATION_DATABASE_URL.

import postgres from "postgres";

const url = process.env["MIGRATION_DATABASE_URL"];
if (!url) {
  console.error("verify: set MIGRATION_DATABASE_URL.");
  process.exit(1);
}

const REQUIRED_TABLES = [
  "profiles",
  "workspaces",
  "projects",
  "media_assets",
  "scheduled_posts",
  "autopilot_configs",
  "notifications",
  "audit_logs",
  "schema_migrations",
];

const REQUIRED_COLUMNS = [
  ["profiles", "timezone", "UTC"],
  ["autopilot_configs", "timezone", "UTC"],
];

const REQUIRED_INDEXES = [
  "media_assets_workspace_created_idx",
  "content_ideas_workspace_created_idx",
  "projects_workspace_updated_idx",
  "published_posts_workspace_published_idx",
  "characters_workspace_created_idx",
  "voices_workspace_created_idx",
  "scripts_workspace_created_idx",
  "templates_workspace_name_idx",
  "social_accounts_workspace_connected_idx",
  "credit_transactions_workspace_created_idx",
  "audit_logs_created_idx",
  "audit_logs_workspace_created_idx",
  "notifications_workspace_created_idx",
  "profiles_lower_email_idx",
  "autopilot_configs_enabled_idx",
];

const REQUIRED_FUNCTIONS = ["reorder_scenes", "handle_new_user"];
const REQUIRED_CONSTRAINTS = ["profiles_timezone_format", "autopilot_timezone_format"];

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? "  PASS " : "  FAIL ") + name + (detail ? "  (" + detail + ")" : ""));
}

const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
const isLocal = /^(localhost|127\.0\.0\.1|::1)$/.test(host);

const client = postgres(url, { max: 1, ssl: isLocal ? false : "require", onnotice: () => {} });

try {
  console.log("Verifying " + host);

  const tables = await client`
    select table_name from information_schema.tables
    where table_schema = 'public'`;
  const tableNames = new Set(tables.map((r) => r.table_name));
  for (const table of REQUIRED_TABLES) {
    check("table public." + table, tableNames.has(table));
  }

  const columns = await client`
    select table_name, column_name, column_default
    from information_schema.columns
    where table_schema = 'public'`;
  for (const [table, column, expectedDefault] of REQUIRED_COLUMNS) {
    const row = columns.find((c) => c.table_name === table && c.column_name === column);
    const ok = Boolean(row) && String(row.column_default ?? "").includes(expectedDefault);
    check("column " + table + "." + column + " default " + expectedDefault, ok);
  }

  const indexes = await client`select indexname from pg_indexes where schemaname = 'public'`;
  const indexNames = new Set(indexes.map((r) => r.indexname));
  for (const index of REQUIRED_INDEXES) {
    check("index " + index, indexNames.has(index));
  }

  const functions = await client`
    select p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'`;
  const functionNames = new Set(functions.map((r) => r.proname));
  for (const fn of REQUIRED_FUNCTIONS) {
    check("function public." + fn, functionNames.has(fn));
  }

  const constraints = await client`
    select conname, convalidated from pg_constraint
    where connamespace = 'public'::regnamespace`;
  for (const name of REQUIRED_CONSTRAINTS) {
    const row = constraints.find((c) => c.conname === name);
    check("constraint " + name + " (validated)", Boolean(row) && row.convalidated === true);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("");
  if (failed.length > 0) {
    console.error("verify: " + failed.length + " check(s) failed.");
    process.exitCode = 1;
  } else {
    console.log("verify: all " + results.length + " checks passed.");
  }
} finally {
  await client.end({ timeout: 5 });
}
