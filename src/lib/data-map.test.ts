import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifiedTables } from "@/lib/data-map";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle", "migrations");

/** Names of tables that reference the user (directly or via a workspace). */
function userTouchingTables(): Set<string> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();

  const touching = new Set<string>();
  const refsWorkspaces = new Set<string>();
  let cur: string | null = null;

  for (const f of files) {
    for (const raw of readFileSync(join(MIGRATIONS_DIR, f), "utf8").split(/\r?\n/)) {
      const ln = raw.replace(/--.*$/, "");
      const create = ln.match(/^\s*create table (?:if not exists )?public\.([a-z0-9_]+)/i);
      if (create) {
        cur = create[1]!;
        continue;
      }
      if (!cur) continue;
      if (/^\s*\)\s*;/.test(ln)) {
        cur = null;
        continue;
      }
      // Direct personal anchor columns.
      if (/^\s*(user_id|owner_id)\s+uuid\b/i.test(ln)) touching.add(cur);
      // Workspace link (cascade/set-null both count).
      if (/references\s+public\.workspaces\s*\(/i.test(ln)) {
        refsWorkspaces.add(cur);
        touching.add(cur);
      }
    }
  }
  return touching;
}

describe("data map completeness", () => {
  it("classifies every table that references a user or workspace", () => {
    const known = classifiedTables();
    const touching = userTouchingTables();
    const unclassified = [...touching].filter((t) => !known.has(t)).sort();
    expect(unclassified).toEqual([]);
  });

  it("detects the anchor columns that the map depends on", () => {
    const touching = userTouchingTables();
    // `workspaces` is anchored by `owner_id`; the user tables by `user_id`.
    expect(touching.has("workspaces")).toBe(true);
    for (const t of ["user_roles", "workspace_members", "checkout_intents", "audit_logs"]) {
      expect(touching.has(t)).toBe(true);
    }
  });
});
