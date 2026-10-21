# Data map: what we hold, and what happens on erasure

Every table that can reference a person, how it is linked, and what the erasure
routine (`erase_user_data`, migration 0026) does with it. This is the source of
truth for the right-to-erasure / DSAR process; `src/lib/data-map.test.ts` fails
if a new table that references a user or workspace is not classified here.

Two anchors identify a person:

- **`profiles.id`** — the user (equals `auth.users.id`).
- **`workspaces.id`** — the tenant. A user owns zero or more workspaces
  (`workspaces.owner_id`) and belongs to others (`workspace_members`).

Erasure works from those two anchors: it deletes the user's **owned workspaces**
(everything workspace-scoped cascades from there), then detaches the user's
identity from the remaining telemetry tables.

## Classification legend

| Class           | Meaning on erasure                                                              |
| --------------- | ------------------------------------------------------------------------------- |
| **anchor**      | The identity anchor itself. `profiles` is de-identified; `workspaces` deleted.  |
| **cascade**     | Removed because its parent workspace is deleted (`on delete cascade`).          |
| **detach**      | Row kept for security/forensic value; `user_id` set to null, metadata blanked.  |
| **retain**      | Kept as a legal/financial record; no direct identifier retained.                |
| **operational** | Not personal data. Keyed by a salted IP/identity hash; left to retention purge. |

## User-anchored tables (linked to `profiles.id` / `auth.users`)

| Table               | Link                                 | Class         | Erasure action                                              |
| ------------------- | ------------------------------------ | ------------- | ----------------------------------------------------------- |
| `profiles`          | `id` (= auth user)                   | anchor        | De-identified: placeholder email, null name/avatar, tz UTC. |
| `user_roles`        | `user_id`                            | detach→delete | Rows deleted.                                               |
| `workspace_members` | `user_id`                            | delete        | Rows deleted (membership in others' workspaces).            |
| `checkout_intents`  | `user_id`                            | delete        | Rows deleted.                                               |
| `security_events`   | `user_id` (nullable)                 | detach        | `user_id`=null, `metadata`=`{}`, `path`=null.               |
| `analytics_events`  | `user_id` (nullable)                 | detach        | `user_id`=null, `props`=`{}`, `path`=null.                  |
| `error_issues`      | `user_id`, `workspace_id` (nullable) | detach        | `user_id`=null, `workspace_id`=null, `metadata`=`{}`.       |
| `audit_logs`        | `user_id`, `workspace_id` (nullable) | detach        | `user_id`=null, `metadata`=`{}` (non-owned rows survive).   |

## Workspace-anchored tables (removed when the owned workspace is deleted)

All of these have `workspace_id → workspaces(id) on delete cascade` unless noted.

| Table                 | Extra refs (`on delete`)                            | Class   |
| --------------------- | --------------------------------------------------- | ------- |
| `channels`            | —                                                   | cascade |
| `subscriptions`       | —                                                   | cascade |
| `usage_credits`       | — (unique per workspace)                            | cascade |
| `credit_transactions` | —                                                   | cascade |
| `content_ideas`       | `channels` set null                                 | cascade |
| `research_topics`     | —                                                   | cascade |
| `scripts`             | `content_ideas` set null                            | cascade |
| `characters`          | —                                                   | cascade |
| `voices`              | —                                                   | cascade |
| `projects`            | `channels`/`scripts`/`voices` set null              | cascade |
| `scenes`              | `projects` cascade, `characters` set null           | cascade |
| `media_assets`        | —                                                   | cascade |
| `video_jobs`          | `projects` cascade, `scenes` cascade                | cascade |
| `render_jobs`         | `projects` cascade                                  | cascade |
| `social_accounts`     | —                                                   | cascade |
| `scheduled_posts`     | `projects` cascade, `social_accounts` set null      | cascade |
| `published_posts`     | `projects` set null                                 | cascade |
| `analytics`           | `published_posts` cascade                           | cascade |
| `templates`           | `workspace_id` nullable, cascade                    | cascade |
| `autopilot_configs`   | `channels`/`voices` set null                        | cascade |
| `notifications`       | —                                                   | cascade |
| `content_feedback`    | `projects` set null                                 | cascade |
| `audit_logs`          | `workspace_id` cascade (owned) / detach (not owned) | cascade |

> `workspace_members` is also workspace-anchored (cascade), but is listed under
> the user-anchored group because erasure deletes the user's own membership rows
> even in workspaces they do not own.

## Not linked by a live foreign key (must be handled explicitly)

| Table            | Link                        | Class       | Erasure action                                              |
| ---------------- | --------------------------- | ----------- | ----------------------------------------------------------- |
| `payment_ledger` | `workspace_id` (no FK)      | retain      | Kept (append-only, financial record). No direct identifier. |
| `payment_events` | `workspace_id` set null     | retain      | Provider webhook bodies; retained for finance/audit.        |
| `rate_limits`    | key contains salted IP/hash | operational | Removed by `purge_rate_limits` (0016), not by erasure.      |

`payment_ledger` deliberately has **no** foreign key so an audit entry survives
tenant deletion (0017). It stores `provider_customer_id` (a processor id) but no
name, email or card data. This matches the retention carve-out in the privacy
policy (`src/lib/legal.ts`).

## Where PII can appear inside free text

Not a table, but relevant to a data report: free-text fields (`error_issues.message`
/`.stack`, `analytics_events.props`, `audit_logs.metadata`, `security_events.metadata`)
can contain an email or id. All write paths run `src/lib/redact.ts` first, and
erasure blanks the metadata of detached rows.

## Verifying this map

`src/lib/data-map.test.ts` parses the migrations, finds every table with a
`user_id`/`owner_id`/`workspace_id` column or a `references public.workspaces`,
and asserts each is listed in the classification tables above. Add a table
without classifying it and the test fails.

## GDPR / CCPA artefacts

- **Data report** (`exportUserData`, admin → user detail → Export): builds
  everything held about the user, grouped by the categories above, and downloads
  it as Markdown (`src/lib/gdpr-report.ts`, `buildGdprReport`). Read-only, audited
  as `export_user_data`.
- **Removal confirmation** (`eraseUser`): after erasure, downloads a reference
  (`ERASURE-<id>-<date>`) listing what was removed and what was deliberately
  retained (`buildRemovalConfirmation`).

Deletion is **immediate** — there is deliberately no soft-delete grace window.
US law (CCPA/CPRA) requires prompt deletion, not a retention period; only the
financial ledger is retained (tax/accounting). See `docs/migrations.md`.

