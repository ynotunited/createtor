-- ============================================================================
--  UNDO / ROLLBACK  ->  Supabase  ->  SQL Editor  ->  New query  ->  Run
--
--  This reverses everything `apply.sql` did: removes the speed indexes, the
--  reorder helper, the time-zone columns and the signup capture, the Daily
--  Queue backstops, the media bucket limits, and restores the original signup
--  function. Run it only if the app misbehaves after applying and you want to
--  go back to exactly how things were.
--
--  Safe to run more than once.
-- ============================================================================

drop index if exists public.media_assets_workspace_created_idx;
drop index if exists public.content_ideas_workspace_created_idx;
drop index if exists public.projects_workspace_updated_idx;
drop index if exists public.published_posts_workspace_published_idx;
drop index if exists public.characters_workspace_created_idx;
drop index if exists public.voices_workspace_created_idx;
drop index if exists public.scripts_workspace_created_idx;
drop index if exists public.templates_workspace_name_idx;
drop index if exists public.social_accounts_workspace_connected_idx;
drop index if exists public.credit_transactions_workspace_created_idx;
drop index if exists public.audit_logs_created_idx;
drop index if exists public.audit_logs_workspace_created_idx;
drop index if exists public.notifications_workspace_created_idx;
drop index if exists public.profiles_lower_email_idx;
drop index if exists public.autopilot_configs_enabled_idx;

drop trigger if exists autopilot_entitlement_guard on public.autopilot_configs;
drop function if exists public.enforce_autopilot_entitlement();

drop function if exists public.claim_first_admin(uuid);

alter table public.autopilot_configs drop constraint if exists autopilot_videos_per_week_range;
alter table public.autopilot_configs drop constraint if exists autopilot_duration_range;

update storage.buckets
set file_size_limit = null, allowed_mime_types = null
where id = 'media';

drop function if exists public.reorder_scenes(uuid[]);

alter table public.profiles drop constraint if exists profiles_timezone_format;
alter table public.autopilot_configs drop constraint if exists autopilot_timezone_format;

revoke update (timezone) on public.profiles from authenticated;

alter table public.profiles drop column if exists timezone;
alter table public.autopilot_configs drop column if exists timezone;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
