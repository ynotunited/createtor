-- migrate:no-transaction
-- ========== performance: hot-path indexes + batched scene reorder ==========
--
-- ZERO-DOWNTIME NOTES
--   * Every statement below runs OUTSIDE a transaction (see the
--     `migrate:no-transaction` directive above) because `create index
--     concurrently` cannot run inside one. The runner executes each statement
--     in autocommit mode.
--   * `concurrently` builds the index without an ACCESS EXCLUSIVE lock, so
--     writes to these tables are never blocked while this runs.
--   * This migration is purely additive: it creates indexes and one function.
--     Nothing is dropped, so it is safe to run against a live database and safe
--     to leave half-applied (re-running skips existing indexes). The paired
--     `0022_perf_indexes.down.sql` drops exactly what this creates.

create index concurrently if not exists media_assets_workspace_created_idx
  on public.media_assets (workspace_id, created_at desc);

create index concurrently if not exists content_ideas_workspace_created_idx
  on public.content_ideas (workspace_id, created_at desc);

create index concurrently if not exists projects_workspace_updated_idx
  on public.projects (workspace_id, updated_at desc);

create index concurrently if not exists published_posts_workspace_published_idx
  on public.published_posts (workspace_id, published_at desc);

create index concurrently if not exists characters_workspace_created_idx
  on public.characters (workspace_id, created_at desc);

create index concurrently if not exists voices_workspace_created_idx
  on public.voices (workspace_id, created_at desc);

create index concurrently if not exists scripts_workspace_created_idx
  on public.scripts (workspace_id, created_at desc);

create index concurrently if not exists templates_workspace_name_idx
  on public.templates (workspace_id, name);

create index concurrently if not exists social_accounts_workspace_connected_idx
  on public.social_accounts (workspace_id, connected_at desc);

create index concurrently if not exists credit_transactions_workspace_created_idx
  on public.credit_transactions (workspace_id, created_at desc);

-- Admin console reads: recent-first audit feed, global and per-workspace.
create index concurrently if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc);

create index concurrently if not exists audit_logs_workspace_created_idx
  on public.audit_logs (workspace_id, created_at desc);

create index concurrently if not exists notifications_workspace_created_idx
  on public.notifications (workspace_id, created_at desc);

-- Speeds up the admin duplicate-user scan, which groups on lower(email).
create index concurrently if not exists profiles_lower_email_idx
  on public.profiles (lower(email));

-- Reordering a storyboard used to issue one UPDATE per scene (up to 150 round
-- trips to the database). This applies the whole ordering in a single
-- statement. It runs as the caller (security invoker) so row-level security
-- still restricts which scenes can be updated.
create or replace function public.reorder_scenes(_ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.scenes s
     set scene_number = u.ord,
         updated_at = now()
    from unnest(_ids) with ordinality as u(id, ord)
   where s.id = u.id;
$$;

grant execute on function public.reorder_scenes(uuid[]) to authenticated;
