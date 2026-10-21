-- ========== distributed rate limiting ==========

-- Fixed-window counters shared by every Worker instance. The previous limiter
-- in /api/generate-image was an in-memory Map: it was per-isolate, so it reset
-- on every cold start and gave each region its own budget (no real protection
-- at scale). Postgres is the one piece of shared state all Workers see, so the
-- counter lives here.
--
-- One row per (key, window). Rows are tiny and short-lived; purge_rate_limits()
-- drops old windows (schedule it with pg_cron if available).
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
-- Only the service role may touch this table; clients must never read or write
-- their own counters.
revoke all on public.rate_limits from public, anon, authenticated;

-- Atomically increments the current window's counter and reports whether the
-- caller is still within the limit. The single INSERT ... ON CONFLICT statement
-- makes concurrent requests serialize on the row, so bursts cannot slip past.
create or replace function public.check_rate_limit(
  _key text,
  _limit integer,
  _window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _window_start timestamptz;
  _count integer;
begin
  if _limit <= 0 then return false; end if;
  if _window_seconds <= 0 then raise exception 'Invalid rate limit window'; end if;
  _window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / _window_seconds) * _window_seconds
  );
  insert into public.rate_limits (key, window_start, count)
  values (_key, _window_start, 1)
  on conflict (key, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into _count;
  return _count <= _limit;
end;
$$;
revoke all on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Housekeeping: delete windows older than the given age. Call from a scheduled
-- job (e.g. pg_cron) so the table stays small.
create or replace function public.purge_rate_limits(_older_than_seconds integer default 3600)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _deleted integer;
begin
  delete from public.rate_limits
   where window_start < now() - make_interval(secs => _older_than_seconds);
  get diagnostics _deleted = row_count;
  return _deleted;
end;
$$;
revoke all on function public.purge_rate_limits(integer)
  from public, anon, authenticated;
grant execute on function public.purge_rate_limits(integer) to service_role;
