-- ============================================================================
--  PASTE THIS INTO SUPABASE  ->  SQL Editor  ->  New query  ->  Run
--
--  PENDING BATCH. These are the migrations that are NOT yet in your database,
--  and they are NOT part of `apply.sql` above. Run this once, then you are
--  fully caught up.
--
--  Contains, in order:
--    0013  security_events table + purge_security_events()
--    0014  ensure_workspace() atomic bootstrap
--    0015  claim_free_monthly_credits() + usage_credits.free_grant_at
--    0017  checkout_intents + payment_ledger + append-only trigger
--    0019  peek_rate_limit() + clear_rate_limit()
--    0020  error_issues + analytics_events + record/purge helpers
--
--  Everything here is idempotent (create-if-not-exists / create-or-replace /
--  drop-...-if-exists) and transaction-safe. Nothing is deleted.
--
--  If anything misbehaves afterwards, run `rollback-pending.sql` to undo.
-- ============================================================================


-- ============================================================================
-- 0013 - security_events
-- ============================================================================
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


-- ============================================================================
-- 0014 - ensure_workspace
-- ============================================================================
create or replace function public.ensure_workspace(
  _user_id uuid,
  _default_name text,
  _free_credits integer
)
returns table (id uuid, name text, plan public.plan_tier, owner_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  _ws_id uuid;
  _ws_name text;
  _ws_plan public.plan_tier;
  _ws_owner uuid;
  _credit_row uuid;
begin
  if _user_id is null then
    raise exception 'user id is required';
  end if;
  if _free_credits is null or _free_credits < 0 then
    raise exception 'free credits must be >= 0';
  end if;

  perform pg_advisory_xact_lock(hashtext(_user_id::text)::bigint);

  select w.id, w.name, w.plan, w.owner_id
    into _ws_id, _ws_name, _ws_plan, _ws_owner
  from public.workspaces w
  where w.owner_id = _user_id
  order by w.created_at asc
  limit 1;

  if _ws_id is null then
    insert into public.workspaces (owner_id, name)
    values (_user_id, coalesce(nullif(btrim(_default_name), ''), 'My workspace'))
    returning workspaces.id, workspaces.name, workspaces.plan, workspaces.owner_id
    into _ws_id, _ws_name, _ws_plan, _ws_owner;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (_ws_id, _user_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  insert into public.usage_credits (workspace_id, balance, lifetime_purchased)
  values (_ws_id, _free_credits, 0)
  on conflict (workspace_id) do nothing
  returning usage_credits.id into _credit_row;

  if _credit_row is not null then
    insert into public.credit_transactions (workspace_id, kind, amount, reason)
    values (_ws_id, 'grant', _free_credits, 'Free monthly credits');
  end if;

  return query select _ws_id, _ws_name, _ws_plan, _ws_owner;
end;
$$;

revoke all on function public.ensure_workspace(uuid, text, integer) from public;
revoke all on function public.ensure_workspace(uuid, text, integer) from anon, authenticated;
grant execute on function public.ensure_workspace(uuid, text, integer) to service_role;


-- ============================================================================
-- 0015 - free monthly credits
-- ============================================================================
alter table public.usage_credits
  add column if not exists free_grant_at timestamptz not null default now();

create or replace function public.claim_free_monthly_credits(
  _workspace_id uuid,
  _credits integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _plan public.plan_tier;
  _balance integer;
  _last timestamptz;
  _delta integer;
begin
  if _workspace_id is null then
    raise exception 'workspace id is required';
  end if;
  if _credits is null or _credits < 0 then
    raise exception 'credits must be >= 0';
  end if;
  if not public.is_workspace_member(_workspace_id) then
    raise exception 'Not a member of this workspace';
  end if;

  perform pg_advisory_xact_lock(hashtext('free_credits:' || _workspace_id::text)::bigint);

  select w.plan into _plan from public.workspaces w where w.id = _workspace_id;
  if _plan is null then
    raise exception 'Workspace not found';
  end if;
  if _plan <> 'free' then
    return 0;
  end if;

  select balance, free_grant_at into _balance, _last
    from public.usage_credits
   where workspace_id = _workspace_id;
  if not found then
    return 0;
  end if;

  if date_trunc('month', _last) >= date_trunc('month', now()) then
    return 0;
  end if;

  if _balance >= _credits then
    update public.usage_credits
       set free_grant_at = now(), updated_at = now()
     where workspace_id = _workspace_id;
    return 0;
  end if;

  _delta := _credits - _balance;
  update public.usage_credits
     set balance = _credits, free_grant_at = now(), updated_at = now()
   where workspace_id = _workspace_id;

  insert into public.credit_transactions (workspace_id, kind, amount, reason)
  values (_workspace_id, 'grant', _delta, 'Monthly free credits');

  return _delta;
end;
$$;

revoke all on function public.claim_free_monthly_credits(uuid, integer) from public;
revoke all on function public.claim_free_monthly_credits(uuid, integer) from anon;
grant execute on function public.claim_free_monthly_credits(uuid, integer) to authenticated;


-- ============================================================================
-- 0017 - checkout idempotency + immutable payment ledger
-- ============================================================================
create table if not exists public.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  user_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  plan text not null,
  billing_cycle text not null,
  status text not null default 'pending',
  provider_session_id text,
  redirect_url text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);
create index if not exists checkout_intents_workspace_idx
  on public.checkout_intents (workspace_id, created_at desc);

alter table public.checkout_intents enable row level security;
revoke all on public.checkout_intents from public, anon, authenticated;

create table if not exists public.payment_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  provider text not null,
  entry_type text not null,
  provider_event_id text,
  provider_subscription_id text,
  provider_customer_id text,
  amount_usd numeric(12,2),
  currency text not null default 'usd',
  plan text,
  billing_cycle text,
  status text,
  period_end timestamptz,
  cancel_at_period_end boolean,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id, entry_type)
);
create index if not exists payment_ledger_workspace_idx
  on public.payment_ledger (workspace_id, occurred_at desc);

alter table public.payment_ledger enable row level security;

grant select on public.payment_ledger to authenticated;
grant all on public.payment_ledger to service_role;
revoke insert, update, delete on public.payment_ledger from authenticated, anon;

drop policy if exists "members read payment ledger" on public.payment_ledger;
create policy "members read payment ledger" on public.payment_ledger
  for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.reject_payment_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'payment_ledger is append-only (attempted %)', tg_op;
end;
$$;
drop trigger if exists payment_ledger_immutable on public.payment_ledger;
create trigger payment_ledger_immutable
  before update or delete on public.payment_ledger
  for each row execute function public.reject_payment_ledger_mutation();


-- ============================================================================
-- 0019 - rate-limit peek + clear helpers
-- ============================================================================
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


-- ============================================================================
-- 0020 - observability (error issues + analytics events)
-- ============================================================================
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
