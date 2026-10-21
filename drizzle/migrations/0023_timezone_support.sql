-- ========== time-zone aware scheduling — EXPAND step ==========
--
-- ADDITIVE ONLY: nothing is renamed, dropped or narrowed, so the previous
-- application build keeps working after this migration runs. A future deploy
-- ("contract" step) can tighten things once every reader understands `timezone`.
--
-- This file runs inside a transaction (no `migrate:no-transaction` directive),
-- so if any statement fails the whole migration rolls back immediately — the
-- database is never left half-migrated.

-- 1) Store the schedule's wall-clock basis. A constant DEFAULT is a
--    metadata-only change on Postgres 11+, so existing rows are valid without a
--    table rewrite or a long lock.
alter table public.profiles
  add column if not exists timezone text not null default 'UTC';

alter table public.autopilot_configs
  add column if not exists timezone text not null default 'UTC';

-- 2) Validate lazily. `ADD CONSTRAINT ... NOT VALID` takes only a brief lock and
--    does not scan existing rows; `VALIDATE CONSTRAINT` then checks them under a
--    weaker lock that lets normal traffic continue.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_timezone_format') then
    alter table public.profiles
      add constraint profiles_timezone_format
      check (char_length(timezone) between 1 and 64) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'autopilot_timezone_format') then
    alter table public.autopilot_configs
      add constraint autopilot_timezone_format
      check (char_length(timezone) between 1 and 64) not valid;
  end if;
end $$;

alter table public.profiles validate constraint profiles_timezone_format;
alter table public.autopilot_configs validate constraint autopilot_timezone_format;

-- 3) Migration 0009 narrowed profile updates to (full_name, avatar_url). Let a
--    signed-in user set their own time zone.
grant update (timezone) on public.profiles to authenticated;

-- 4) Capture the browser time zone at signup. The client sends `timezone` in the
--    signUp metadata; the existing trigger now persists it.
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

-- 5) The scheduler only ever scans enabled queues; a partial index keeps it cheap.
create index if not exists autopilot_configs_enabled_idx
  on public.autopilot_configs (enabled, workspace_id)
  where enabled;
