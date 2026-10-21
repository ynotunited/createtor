#!/usr/bin/env node
// Zero-downtime migration runner with an immediate-rollback path.
//
// Why a runner instead of the Supabase SQL editor:
//   - The SQL editor wraps the whole script in a transaction, which makes
//     "create index concurrently" fail. This runner sends statements one at a
//     time (autocommit) for migrations marked "-- migrate:no-transaction".
//   - It records what applied in public.schema_migrations so a migration can be
//     rolled back precisely, and so staging and production can be compared.
//
// Commands
//   node scripts/db/migrate.mjs                  apply every pending migration
//   node scripts/db/migrate.mjs --dry-run        show the plan, touch nothing
//   node scripts/db/migrate.mjs baseline 0021    mark <=0021 applied, do not run
//   node scripts/db/migrate.mjs rollback         undo the most recent migration
//   node scripts/db/migrate.mjs rollback-to 0021 undo everything after 0021
//
// Flags
//   --on-fail-rollback   if a migration fails, run its .down.sql immediately
//
// Connection: MIGRATION_DATABASE_URL (see docs/migrations.md).
// Never run this against production first: run it on staging (see docs/migrations.md).

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { isNoTransaction, splitStatements } from "./sql-split.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, "../../drizzle/migrations");

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const DRY_RUN = flags.has("--dry-run");
const ON_FAIL_ROLLBACK = flags.has("--on-fail-rollback");

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

function fail(message) {
  console.error("migrate: " + message);
  process.exit(1);
}

function requireConnectionString() {
  const url = process.env["MIGRATION_DATABASE_URL"];
  if (!url) {
    fail(
      "no connection string. Set MIGRATION_DATABASE_URL " +
        "to the staging/production Postgres URI.",
    );
  }
  return url;
}

function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return parsed.host + parsed.pathname;
  } catch {
    return "(unparseable URL)";
  }
}

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql") && !name.endsWith(".down.sql"))
    .sort()
    .map((name) => {
      const version = name.replace(/\.sql$/, "");
      const content = readFileSync(resolve(MIGRATIONS_DIR, name), "utf8");
      return {
        version,
        file: resolve(MIGRATIONS_DIR, name),
        downFile: resolve(MIGRATIONS_DIR, version + ".down.sql"),
        content,
        checksum: sha256(content),
      };
    });
}

async function runStatements(client, sql, { label }) {
  const statements = splitStatements(sql);
  const noTx = isNoTransaction(sql);
  if (statements.length === 0) return;

  if (noTx) {
    // Autocommit: each statement is its own implicit transaction. Required for
    // CREATE/DROP INDEX CONCURRENTLY. Additive + guarded, so re-running is safe.
    console.log(
      "  " + label + ": " + statements.length + " statement(s), autocommit (no-transaction)",
    );
    for (const statement of statements) {
      await client.unsafe(statement);
    }
    return;
  }

  // Transaction: a failure rolls the whole migration back instantly.
  console.log("  " + label + ": " + statements.length + " statement(s), single transaction");
  await client.begin(async (tx) => {
    for (const statement of statements) {
      await tx.unsafe(statement);
    }
  });
}

async function ensureLedger(client) {
  await client`
    create table if not exists public.schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `;
}

async function readApplied(client) {
  const rows =
    await client`select version, checksum from public.schema_migrations order by version`;
  const map = new Map();
  for (const row of rows) map.set(row.version, row.checksum);
  return map;
}

async function markApplied(client, migration) {
  await client`
    insert into public.schema_migrations (version, checksum)
    values (${migration.version}, ${migration.checksum})
    on conflict (version) do update set checksum = excluded.checksum, applied_at = now()
  `;
}

async function unmarkApplied(client, version) {
  await client`delete from public.schema_migrations where version = ${version}`;
}

async function apply(client, migrations) {
  const applied = await readApplied(client);
  const pending = migrations.filter((m) => !applied.has(m.version));

  if (pending.length === 0) {
    console.log("Nothing to apply; all migrations are recorded.");
    return;
  }

  console.log("Plan (apply " + pending.length + "):");
  for (const m of pending) {
    console.log("  + " + m.version + (isNoTransaction(m.content) ? "  [no-transaction]" : ""));
  }
  if (DRY_RUN) {
    console.log("Dry run: no changes made.");
    return;
  }

  for (const migration of pending) {
    console.log("Applying " + migration.version + "...");
    try {
      await runStatements(client, migration.content, { label: migration.version });
      await markApplied(client, migration);
      console.log("  ok " + migration.version);
    } catch (error) {
      console.error("  FAILED " + migration.version + ": " + (error && error.message));
      if (ON_FAIL_ROLLBACK) {
        await rollbackOne(client, migration, { silentMissingDown: true });
      }
      throw error;
    }
  }
}

async function rollbackOne(client, migration, options = {}) {
  const { silentMissingDown = false } = options;
  let down;
  try {
    down = readFileSync(migration.downFile, "utf8");
  } catch {
    if (silentMissingDown) {
      console.error("  no down script for " + migration.version + "; manual rollback required");
      return;
    }
    fail("no down script at " + migration.downFile);
  }
  console.log("Rolling back " + migration.version + "...");
  await runStatements(client, down, { label: migration.version + " (down)" });
  await unmarkApplied(client, migration.version);
  console.log("  rolled back " + migration.version);
}

async function rollback(client, migrations, toVersion) {
  const applied = await readApplied(client);
  const appliedInOrder = migrations.filter((m) => applied.has(m.version));
  if (appliedInOrder.length === 0) {
    console.log("Nothing to roll back.");
    return;
  }

  let targets;
  if (toVersion) {
    const index = migrations.findIndex((m) => m.version === toVersion);
    if (index === -1) fail("unknown version: " + toVersion);
    targets = appliedInOrder.filter((m) => migrations.indexOf(m) > index);
  } else {
    targets = [appliedInOrder[appliedInOrder.length - 1]];
  }

  if (targets.length === 0) {
    console.log("Nothing to roll back after " + toVersion + ".");
    return;
  }

  console.log("Plan (roll back " + targets.length + "):");
  for (const m of [...targets].reverse()) console.log("  - " + m.version);
  if (DRY_RUN) {
    console.log("Dry run: no changes made.");
    return;
  }

  for (const migration of [...targets].reverse()) {
    await rollbackOne(client, migration);
  }
}

async function baseline(client, migrations, upTo) {
  const index = migrations.findIndex((m) => m.version === upTo);
  if (index === -1) fail("unknown version: " + upTo);
  const applied = await readApplied(client);
  let count = 0;
  for (const migration of migrations.slice(0, index + 1)) {
    if (applied.has(migration.version)) continue;
    await markApplied(client, migration);
    console.log("  baselined " + migration.version);
    count += 1;
  }
  console.log("Baselined " + count + " migration(s); nothing was executed.");
}

async function main() {
  const url = requireConnectionString();
  const command = positional[0] ?? "apply";
  const target = positional[1];

  const migrations = listMigrations();
  console.log("Target: " + describeTarget(url));
  console.log("Migrations dir: " + MIGRATIONS_DIR + " (" + migrations.length + " files)");
  console.log("Command: " + command + (DRY_RUN ? " (dry run)" : ""));

  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  const isLocal = /^(localhost|127\.0\.0\.1|::1)$/.test(host);

  const client = postgres(url, {
    max: 1,
    ssl: isLocal ? false : "require",
    onnotice: () => {},
  });

  try {
    if (command === "apply") {
      if (!DRY_RUN) await ensureLedger(client);
      await apply(client, migrations);
    } else if (command === "rollback") {
      await ensureLedger(client);
      await rollback(client, migrations, undefined);
    } else if (command === "rollback-to") {
      if (!target) fail("rollback-to needs a version, e.g. rollback-to 0021");
      await ensureLedger(client);
      await rollback(client, migrations, target);
    } else if (command === "baseline") {
      if (!target) fail("baseline needs a version, e.g. baseline 0021");
      if (!DRY_RUN) await ensureLedger(client);
      await baseline(client, migrations, target);
    } else {
      fail("unknown command: " + command);
    }
    console.log("Done.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("migrate: aborted");
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
