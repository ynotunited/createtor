-- ============================================================================
--  PASTE THIS INTO SUPABASE  ->  SQL Editor  ->  New query  ->  Run
--
--  What it does (all safe, nothing is deleted):
--    1. Adds speed indexes the app uses.
--    2. Adds a small helper the app calls when you reorder a storyboard.
--    3. Adds a `timezone` column to your profile and your daily-queue settings,
--       and captures the visitor's time zone automatically at signup.
--    4. Adds database backstops for the Daily Queue (value ranges + plan
--       entitlement) so a browser cannot bypass them.
--    5. Puts the 50 MB size and file-type limits on the media upload bucket.
--
--  Safe to run more than once. If anything looks wrong afterwards, run the
--  companion file `rollback.sql` to undo everything in here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Speed indexes
-- ---------------------------------------------------------------------------
create index if not exists media_assets_workspace_created_idx on public.media_assets (workspace_id, created_at desc);
create index if not exists content_ideas_workspace_created_idx on public.content_ideas (workspace_id, created_at desc);
create index if not exists projects_workspace_updated_idx on public.projects (workspace_id, updated_at desc);
create index if not exists published_posts_workspace_published_idx on public.published_posts (workspace_id, published_at desc);
create index if not exists characters_workspace_created_idx on public.characters (workspace_id, created_at desc);
create index if not exists voices_workspace_created_idx on public.voices (workspace_id, created_at desc);
create index if not exists scripts_workspace_created_idx on public.scripts (workspace_id, created_at desc);
create index if not exists templates_workspace_name_idx on public.templates (workspace_id, name);
create index if not exists social_accounts_workspace_connected_idx on public.social_accounts (workspace_id, connected_at desc);
create index if not exists credit_transactions_workspace_created_idx on public.credit_transactions (workspace_id, created_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_workspace_created_idx on public.audit_logs (workspace_id, created_at desc);
create index if not exists notifications_workspace_created_idx on public.notifications (workspace_id, created_at desc);
create index if not exists profiles_lower_email_idx on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- 2. Reorder helper (one round-trip instead of one per scene)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Time zone support
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists timezone text not null default 'UTC';

alter table public.autopilot_configs
  add column if not exists timezone text not null default 'UTC';

alter table public.profiles drop constraint if exists profiles_timezone_format;
alter table public.profiles
  add constraint profiles_timezone_format
  check (char_length(timezone) between 1 and 64);
alter table public.autopilot_configs drop constraint if exists autopilot_timezone_format;
alter table public.autopilot_configs
  add constraint autopilot_timezone_format
  check (char_length(timezone) between 1 and 64);

grant update (timezone) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, timezone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    coalesce(nullif(new.raw_user_meta_data->>'timezone', ''), 'UTC')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create index if not exists autopilot_configs_enabled_idx
  on public.autopilot_configs (enabled, workspace_id)
  where enabled;

-- ---------------------------------------------------------------------------
-- 4. Daily Queue backstops (value ranges + plan entitlement)
-- ---------------------------------------------------------------------------
alter table public.autopilot_configs drop constraint if exists autopilot_videos_per_week_range;
alter table public.autopilot_configs
  add constraint autopilot_videos_per_week_range
  check (videos_per_week between 1 and 35);

alter table public.autopilot_configs drop constraint if exists autopilot_duration_range;
alter table public.autopilot_configs
  add constraint autopilot_duration_range
  check (video_duration_seconds between 10 and 900);

create or replace function public.enforce_autopilot_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  parent_plan public.plan_tier;
begin
  select plan into parent_plan from public.workspaces where id = new.workspace_id;
  if parent_plan is null or parent_plan not in ('pro', 'agency') then
    new.enabled := false;
  end if;
  return new;
end $$;

drop trigger if exists autopilot_entitlement_guard on public.autopilot_configs;
create trigger autopilot_entitlement_guard
  before insert or update on public.autopilot_configs
  for each row execute function public.enforce_autopilot_entitlement();

-- Atomic first-admin claim (replaces a read-then-write that could double-grant).
create or replace function public.claim_first_admin(_user_id uuid)
returns public.app_role language plpgsql security definer set search_path = public as $$
declare
  claimed public.app_role;
begin
  perform pg_advisory_xact_lock(hashtext('claim_first_admin'));
  if exists (select 1 from public.user_roles where role in ('admin', 'super_admin')) then
    return null;
  end if;
  insert into public.user_roles (user_id, role)
    values (_user_id, 'super_admin')
    on conflict (user_id, role) do nothing;
  claimed := 'super_admin';
  return claimed;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Media upload bucket limits
-- ---------------------------------------------------------------------------
update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/aac',
    'audio/ogg',
    'audio/webm'
  ]
where id = 'media';
