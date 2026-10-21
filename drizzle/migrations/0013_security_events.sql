-- 0013_security_events.sql
-- Queryable security telemetry. Console logs are ephemeral on Workers, so
-- high-signal events (rate-limit trips, invalid webhook signatures, auth
-- denials, HTTPS redirects) are persisted here for admin review.
--
-- Writes happen only through the service role. RLS is enabled with no policies,
-- so anon/authenticated can never read or write this table directly; admins
-- read it through a server function.

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  ip text,
  user_id uuid,
  workspace_id uuid,
  path text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.security_events enable row level security;

revoke all on public.security_events from public;
revoke all on public.security_events from anon, authenticated;
grant all on public.security_events to service_role;

create index if not exists security_events_created_at_idx
  on public.security_events (created_at desc);

create index if not exists security_events_kind_created_at_idx
  on public.security_events (kind, created_at desc);

create index if not exists security_events_ip_created_at_idx
  on public.security_events (ip, created_at desc)
  where ip is not null;

-- Retention helper. Call from a scheduled job (pg_cron) or manually; defaults
-- to 90 days. Guarded so an accidental 0/negative value cannot wipe the table.
create or replace function public.purge_security_events(_older_than_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if _older_than_days is null or _older_than_days < 1 then
    raise exception 'retention days must be >= 1';
  end if;

  delete from public.security_events
  where created_at < now() - make_interval(days => _older_than_days);

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_security_events(integer) from public;
revoke all on function public.purge_security_events(integer) from anon, authenticated;
grant execute on function public.purge_security_events(integer) to service_role;
