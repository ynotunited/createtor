# Database migrations: staging-first, zero-downtime, instantly reversible

Every schema change follows three rules:

1. **Expand before contract.** A migration only _adds_ things. Renames and drops
   happen in a later, separate migration, after the application no longer reads
   the old shape. This is what keeps a deploy and a migration from having to
   happen at the same instant.
2. **Staging first, on current data.** The migration runs on a _fresh mirror_ of
   production, never on production first and never on a stale copy.
3. **A rollback exists before the migration runs.** If it half-applies, it is
   undone immediately, not after a debugging session.

## The runner

`scripts/db/migrate.mjs` replaces pasting SQL into the Supabase editor. It matters
because the editor wraps a script in a transaction, which makes
`create index concurrently` fail; the runner sends those statements one at a time.

```
node scripts/db/migrate.mjs                 # apply pending migrations
node scripts/db/migrate.mjs --dry-run       # show the plan, change nothing
node scripts/db/migrate.mjs baseline 0021   # mark <=0021 applied, do not run
node scripts/db/migrate.mjs rollback        # undo the most recent migration
node scripts/db/migrate.mjs rollback-to 0021
node scripts/db/migrate.mjs apply --on-fail-rollback
```

It records what applied in `public.schema_migrations` (version + checksum), so a
rollback targets exactly one migration and staging can be diffed against prod.

**One-time baseline.** The existing live database was migrated by hand, so its
ledger is empty. Before the first `apply` on any existing database, record what
is already there:

```
node scripts/db/migrate.mjs baseline 0021
```

From then on, `apply` only runs 0022 and later.

## Environment variables

| Variable                 | Purpose                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `MIGRATION_DATABASE_URL` | The database `migrate.mjs` / `verify.mjs` connect to        |
| `LIVE_DATABASE_URL`      | Production URI; read by the clone script                    |
| `STAGING_DATABASE_URL`   | Staging URI; read by the clone script                       |
| `PGBIN`                  | Directory with `pg_dump` / `pg_restore` / `psql` (optional) |

Credentials are never printed; the tools log only host + database name.

## Staging workflow (run this every time)

```powershell
# 0. One-time: create a second Supabase project for staging. Never a copy made
#    weeks ago. Refresh it right before every migration.

# 1. Make staging a CURRENT mirror of live.
./scripts/db/clone-live-to-staging.ps1        # or use Supabase Database Branching

# 2. Point the runner at staging and preview.
$env:MIGRATION_DATABASE_URL = $env:STAGING_DATABASE_URL
node scripts/db/migrate.mjs baseline 0021     # first time only
node scripts/db/migrate.mjs --dry-run

# 3. Apply on staging, then prove the schema.
node scripts/db/migrate.mjs
node scripts/db/verify.mjs                    # exits 1 on any failed check

# 4. Exercise the app against staging (sign up, schedule a post, reorder scenes).

# 5. Promote: same commands, pointed at production.
$env:MIGRATION_DATABASE_URL = $env:LIVE_DATABASE_URL
node scripts/db/migrate.mjs --dry-run
node scripts/db/migrate.mjs
node scripts/db/verify.mjs
```

> Supabase Database Branching creates an up-to-date copy (auth included) in one
> step and is the preferred path. The `pg_dump`/`pg_restore` script is the
> fallback and needs the Postgres client tools.

## Rollback plan (written before the migration starts)

| Failure mode                                                 | Immediate action                                                                                                      | Why it is safe                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A statement fails mid-file                                   | **Nothing to do.** The runner wraps each migration in a transaction, so it rolls back the instant a statement errors. | The migration is atomic.                                                        |
| A `no-transaction` migration (concurrent index) fails midway | Re-run `node scripts/db/migrate.mjs`. It is additive and guarded with `if not exists`, so re-running completes it.    | No data is changed.                                                             |
| The migration applied but the app misbehaves                 | `node scripts/db/migrate.mjs rollback`                                                                                | Runs the pre-written `.down.sql`, which drops exactly what the migration added. |
| Automate it                                                  | `node scripts/db/migrate.mjs apply --on-fail-rollback`                                                                | On failure, the matching `.down.sql` runs immediately.                          |

The `.down.sql` for every migration is written and reviewed **before** the
migration runs. Down scripts use `concurrently` / `if exists` so they are safe on
live traffic and safe to run on a partially applied schema.

**Contract rule.** Nothing is dropped in the same migration that stops using it.
Future migrations that remove a column take it out only after the down script of
the _removal_ restores the column and its data, and only after the app has
shipped without reading it.

## This change

| File                        | Step   | Type                                                                                                    | Rollback                                                  |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `0022_perf_indexes.sql`     | expand | `create index concurrently` + `reorder_scenes`                                                          | `0022_perf_indexes.down.sql` (via `migrate.mjs rollback`) |
| `0023_timezone_support.sql` | expand | adds `profiles.timezone`, `autopilot_configs.timezone`, lazy constraints, grant, trigger, partial index | `0023_timezone_support.down.sql`                          |

Both are purely additive: the previous app build keeps working after they run.
0023 uses `ADD CONSTRAINT ... NOT VALID` then `VALIDATE`, so validating existing
rows never holds a long lock.

## Manual paste (no runner / no direct DB connection)

When the runner is unavailable (no `MIGRATION_DATABASE_URL`, no Postgres client
tools), apply by pasting into the Supabase SQL Editor. The numbered migration
files are **not** safe to paste directly: `0022_perf_indexes.sql` uses
`create index concurrently`, and the editor wraps a script in a transaction, so
that statement fails with `25001: CREATE INDEX CONCURRENTLY cannot run inside a
transaction block`.

Instead, use the consolidated, transaction-safe, idempotent files:

| File                                 | Covers                                                                                         | Companion rollback                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| `drizzle/supabase/apply.sql`         | 0022 (plain `create index if not exists`) + 0023 + 0024 + 0025                                 | `drizzle/supabase/rollback.sql`         |
| `drizzle/supabase/apply-pending.sql` | 0013 + 0014 + 0015 + 0017 + 0019 + 0020 (the tables/functions missing from a hand-migrated DB) | `drizzle/supabase/rollback-pending.sql` |
| `drizzle/supabase/apply-pii.sql`     | 0026 (retention for error/analytics/audit logs + `erase_user_data`)                            | `drizzle/supabase/rollback-pii.sql`     |

Paste them in that order, in one query each. Every statement is guarded with
`if not exists` / `create or replace` / `drop ... if exists`, so running them
again is a no-op for objects that already exist. Rollback files **drop tables
and data**; read their headers before running them.

## Data retention and erasure (0026)

Two data-protection controls ship with 0026:

- **Retention.** Every unbounded operational table now has a `purge_*` function
  and a `pg_cron` schedule (or a documented external-cron fallback when
  `pg_cron` is unavailable):

  | Table              | Purge function           | Window | Schedule       |
  | ------------------ | ------------------------ | ------ | -------------- |
  | `rate_limits`      | `purge_rate_limits`      | 1 h    | hourly (0016)  |
  | `security_events`  | `purge_security_events`  | 90 d   | daily (0016)   |
  | `error_issues`     | `purge_error_issues`     | 180 d  | weekly (0026)  |
  | `analytics_events` | `purge_analytics_events` | 400 d  | monthly (0026) |
  | `audit_logs`       | `purge_audit_logs`       | 365 d  | daily (0026)   |

  All purge functions are service-role only and refuse a non-positive window.

- **Erasure (right to be forgotten / DSAR).** `erase_user_data(_user_id uuid)`
  (service-role only) runs one transaction per user: deletes owned workspaces
  (content cascades), drops memberships/roles/checkout intents, detaches
  (`user_id = null`) and blanks the metadata of `security_events`,
  `analytics_events`, `error_issues` and `audit_logs`, and de-identifies the
  profile row (placeholder email, null name/avatar). It returns a JSON summary.

  - **Self-service:** Settings → Delete account (`deleteMyAccount`).
  - **Admin:** user detail → Erase (`eraseUser`), super-admin only, blocked for
    self and for other super-admins, with a typed email confirmation.

  **Not erased:** `payment_ledger` is append-only (0017) and retained as a
  financial record; it carries no direct identifier beyond
  `provider_customer_id`. This matches the retention carve-out stated in the
  privacy policy.

- **Redaction at the write path.** Raw IPs are never persisted: `audit_logs`,
  `security_events`, the request log and the admin rate-limiter store a salted
  SHA-256 prefix (`IP_HASH_SALT`, see `.env.example`). Free text (error
  messages/stacks, metadata, analytics props) is scrubbed of emails and
  card-like digit runs by `src/lib/redact.ts` before it is stored.
