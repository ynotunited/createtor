-- 0020_observability.sql
-- Persisted error/issue tracking and product analytics events.
--
-- Before this, both lived only in ephemeral Worker logs. Errors were logged and
-- dropped; there was no way to see "which failures are recurring" or "how do
-- users move through the product". Two append-mostly tables fix that:
--
--   * error_issues      — deduped exceptions, keyed by a fingerprint, with a
--                         running count and first/last seen. Recurrence of a
--                         resolved issue reopens it.
--   * analytics_events  — bounded product events (event name, user, workspace,
--                         free-form props) for funnels and retention.
--
-- Both are service-role only: RLS is enabled and anon/authenticated are revoked,
-- so clients can never read or write them directly. Admin reads go through
-- server functions. Writes go through the RPC / service role.

-- ---------------------------------------------------------------- error issues
create table if not exists public.error_issues (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  kind text not null default 'server',
  level text not null default 'error',
  message text not null,
  stack text,
  path text,
  user_id uuid,
  workspace_id uuid,
  release text,
  count integer not null default 1,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

alter table public.error_issues enable row level security;
revoke all on public.error_issues from public, anon, authenticated;
grant all on public.error_issues to service_role;

create index if not exists error_issues_last_seen_idx
  on public.error_issues (last_seen desc);
create index if not exists error_issues_status_last_seen_idx
  on public.error_issues (status, last_seen desc);

-- Upsert one occurrence: bump the counter, refresh last_seen, reopen resolved
-- issues, and keep the latest message/stack. Fingerprinting happens in app code.
create or replace function public.record_error_issue(
  _fingerprint text,
  _kind text,
  _level text,
  _message text,
  _stack text default null,
  _path text default null,
  _user_id uuid default null,
  _workspace_id uuid default null,
  _release text default null,
  _metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.error_issues
    (fingerprint, kind, level, message, stack, path, user_id, workspace_id, release, metadata)
  values
    (_fingerprint, _kind, _level, _message, _stack, _path, _user_id, _workspace_id, _release,
     coalesce(_metadata, '{}'::jsonb))
  on conflict (fingerprint) do update set
    count = public.error_issues.count + 1,
    last_seen = now(),
    message = excluded.message,
    stack = coalesce(excluded.stack, public.error_issues.stack),
    status = case when public.error_issues.status = 'resolved' then 'open' else public.error_issues.status end;
end;
$$;

revoke all on function
  public.record_error_issue(text, text, text, text, text, text, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.record_error_issue(text, text, text, text, text, text, uuid, uuid, text, jsonb)
  to service_role;

create or replace function public.purge_error_issues(_older_than_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _deleted integer;
begin
  if _older_than_days is null or _older_than_days < 1 then
    raise exception 'retention days must be >= 1';
  end if;
  delete from public.error_issues where last_seen < now() - make_interval(days => _older_than_days);
  get diagnostics _deleted = row_count;
  return _deleted;
end;
$$;

revoke all on function public.purge_error_issues(integer) from public, anon, authenticated;
grant execute on function public.purge_error_issues(integer) to service_role;

-- ------------------------------------------------------------ analytics events
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event text not null,
  user_id uuid,
  workspace_id uuid,
  path text,
  session_id text,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from public, anon, authenticated;
grant all on public.analytics_events to service_role;

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);
create index if not exists analytics_events_event_created_at_idx
  on public.analytics_events (event, created_at desc);
create index if not exists analytics_events_user_created_at_idx
  on public.analytics_events (user_id, created_at desc)
  where user_id is not null;

create or replace function public.purge_analytics_events(_older_than_days integer default 400)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _deleted integer;
begin
  if _older_than_days is null or _older_than_days < 1 then
    raise exception 'retention days must be >= 1';
  end if;
  delete from public.analytics_events where created_at < now() - make_interval(days => _older_than_days);
  get diagnostics _deleted = row_count;
  return _deleted;
end;
$$;

revoke all on function public.purge_analytics_events(integer) from public, anon, authenticated;
grant execute on function public.purge_analytics_events(integer) to service_role;
