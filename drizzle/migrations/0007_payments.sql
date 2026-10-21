-- ========== payments: gateway-agnostic subscriptions + hardening ==========

-- Subscription rows can now describe either gateway.
alter table public.subscriptions
  add column if not exists provider text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_plan_id text,
  add column if not exists billing_cycle text not null default 'monthly',
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz;

-- Billing state is written only by the service role (checkout + webhooks).
-- Members may read their own workspace's billing rows but never write them,
-- so a plan cannot be self-upgraded from the browser.
revoke insert, update, delete on public.subscriptions from authenticated;
revoke insert, update, delete on public.usage_credits from authenticated;
revoke insert, update, delete on public.credit_transactions from authenticated;
-- NOTE: this column-level revoke is a no-op while a table-level UPDATE grant
-- exists; migration 0008 fixes workspaces write access properly.
revoke update (plan) on public.workspaces from authenticated;

drop policy if exists "workspace members access" on public.subscriptions;
create policy "workspace members read subscriptions" on public.subscriptions
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Credits are now written only server-side (workspace bootstrap + billing), so
-- the previous member insert/read policies are replaced by a single read policy.
drop policy if exists "workspace members access" on public.usage_credits;
drop policy if exists "members create starter credits" on public.usage_credits;
drop policy if exists "members read credits" on public.usage_credits;
create policy "workspace members read usage credits" on public.usage_credits
  for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members access" on public.credit_transactions;
drop policy if exists "members read credit transactions" on public.credit_transactions;
create policy "workspace members read credit transactions" on public.credit_transactions
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Idempotent webhook event log (service-role only).
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  type text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);
grant all on public.payment_events to service_role;
alter table public.payment_events enable row level security;
