-- migrate:no-transaction
-- ========== ROLLBACK for 0022_perf_indexes ==========
-- Drops exactly what 0022 created. `drop index concurrently` avoids an
-- ACCESS EXCLUSIVE lock, so this is safe to run against live traffic.
-- Safe to run even if 0022 only partially applied (guarded with if exists).
--
-- NOTE: rolling this back only removes performance indexes and the
-- reorder_scenes helper. The application still works (slower) without them;
-- deleteScene/reorder fall back to row-by-row updates only if you also revert
-- the app code that calls the RPC.

drop index concurrently if exists public.media_assets_workspace_created_idx;
drop index concurrently if exists public.content_ideas_workspace_created_idx;
drop index concurrently if exists public.projects_workspace_updated_idx;
drop index concurrently if exists public.published_posts_workspace_published_idx;
drop index concurrently if exists public.characters_workspace_created_idx;
drop index concurrently if exists public.voices_workspace_created_idx;
drop index concurrently if exists public.scripts_workspace_created_idx;
drop index concurrently if exists public.templates_workspace_name_idx;
drop index concurrently if exists public.social_accounts_workspace_connected_idx;
drop index concurrently if exists public.credit_transactions_workspace_created_idx;
drop index concurrently if exists public.audit_logs_created_idx;
drop index concurrently if exists public.audit_logs_workspace_created_idx;
drop index concurrently if exists public.notifications_workspace_created_idx;
drop index concurrently if exists public.profiles_lower_email_idx;

drop function if exists public.reorder_scenes(uuid[]);
