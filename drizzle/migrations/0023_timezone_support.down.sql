-- migrate:no-transaction
-- ========== ROLLBACK for 0023_timezone_support ==========
-- Reverses the expand step. Drops the added columns (and everything that
-- references them) and restores the previous handle_new_user trigger body.
--
-- WARNING: dropping `timezone` discards any time zones captured after this
-- migration. Roll back before widening usage, or export the column first:
--   copy (select id, timezone from public.profiles) to stdout with csv header;
-- Because the app reads `timezone` with a 'UTC' fallback, code does not need to
-- be reverted for this rollback to be safe.

alter table public.profiles drop constraint if exists profiles_timezone_format;
alter table public.autopilot_configs drop constraint if exists autopilot_timezone_format;

revoke update (timezone) on public.profiles from authenticated;

alter table public.profiles drop column if exists timezone;
alter table public.autopilot_configs drop column if exists timezone;

-- Restore the pre-0023 trigger (no timezone column).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

-- Last, because it needs autocommit (concurrently).
drop index concurrently if exists public.autopilot_configs_enabled_idx;
