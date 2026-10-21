-- ========== enforceable autopilot bounds + entitlement — BACKSTOP ==========
--
-- The Daily Queue settings used to be written straight from the browser with
-- only HTML attributes and a React conditional for validation. The application
-- now saves them through a server function that re-derives the workspace plan
-- and clamps the numbers, but this migration makes the database itself the last
-- line of defence: a direct PostgREST write can no longer enable the queue on a
-- non-entitled plan or store out-of-range values.
--
-- This file runs inside a transaction (no `migrate:no-transaction` directive),
-- so if any statement fails the whole migration rolls back immediately.

-- 1) Numeric bounds. NOT VALID + VALIDATE keeps the lock weak on a live table;
--    the app already clamps, so no existing row is expected to violate this.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'autopilot_videos_per_week_range') then
    alter table public.autopilot_configs
      add constraint autopilot_videos_per_week_range
      check (videos_per_week between 1 and 35) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'autopilot_duration_range') then
    alter table public.autopilot_configs
      add constraint autopilot_duration_range
      check (video_duration_seconds between 10 and 900) not valid;
  end if;
end $$;

alter table public.autopilot_configs validate constraint autopilot_videos_per_week_range;
alter table public.autopilot_configs validate constraint autopilot_duration_range;

-- 2) Plan entitlement. A BEFORE trigger coerces `enabled` to false (rather than
--    erroring) when the parent workspace is not on a plan that includes Daily
--    Queue, so a stale client never gets a hard failure but also never
--    activates an unentitled queue.
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

-- 3) Atomic bootstrap admin claim. The previous application logic read the
--    admin count and then inserted, which two concurrent callers could both
--    win. This runs the check and the insert in one serialized statement so at
--    most one super admin can ever be bootstrapped. Returns the role granted, or
--    null when an administrator already exists.
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
