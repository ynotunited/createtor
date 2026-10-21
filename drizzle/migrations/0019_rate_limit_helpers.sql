-- 0019_rate_limit_helpers.sql
-- Read + delete helpers for the fixed-window limiter introduced in 0011.
--
-- `check_rate_limit` only ever increments. Behavioural lockouts need two more
-- operations:
--   * peek  — read the current window's count WITHOUT incrementing, so a
--             legitimate attempt never raises its own failure counter;
--   * clear — delete a counter, so a successful login resets the failure count
--             and an admin can unblock an identity manually.
--
-- Both are service_role only: counters are operational state, never user data.

create or replace function public.peek_rate_limit(_key text, _window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _window_start timestamptz;
  _count integer;
begin
  if _window_seconds is null or _window_seconds <= 0 then return 0; end if;
  _window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / _window_seconds) * _window_seconds
  );
  select count into _count
    from public.rate_limits
   where key = _key and window_start = _window_start;
  return coalesce(_count, 0);
end;
$$;

create or replace function public.clear_rate_limit(_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where key = _key;
$$;

revoke all on function public.peek_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.peek_rate_limit(text, integer) to service_role;

revoke all on function public.clear_rate_limit(text) from public, anon, authenticated;
grant execute on function public.clear_rate_limit(text) to service_role;
