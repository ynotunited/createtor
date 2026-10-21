-- ========== payments: client idempotency keys + immutable ledger ==========

-- 1) Checkout idempotency keys.
--
-- A network timeout between the browser and the server is indistinguishable
-- from "the request never arrived": a naive retry calls the provider again and
-- can create a second subscription (a duplicate charge). The client therefore
-- generates a UUID per checkout attempt and the server records it *before*
-- calling the provider. A retried request carrying the same key returns the
-- cached redirect instead of charging again.
create table if not exists public.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  user_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  plan text not null,
  billing_cycle text not null,
  status text not null default 'pending', -- pending | created | failed
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
-- Service role only: clients must never read or forge their own idempotency
-- records (a forged key could replay someone else's cached redirect).
revoke all on public.checkout_intents from public, anon, authenticated;

-- 2) Immutable payment ledger.
--
-- Financial state changes are never written by mutating a row. Every intent,
-- capture, failure, refund and subscription transition appends a brand-new row,
-- so the full history is auditable and a botched update cannot erase a charge.
-- The `subscriptions` table remains only as a derived, rebuildable projection of
-- the latest ledger entry per workspace (a read model, not the source of truth).
--
-- `workspace_id` deliberately has no foreign key: the ledger must survive a
-- workspace deletion (audit records outlive the tenant) and a FK's ON DELETE
-- action would otherwise fight the append-only trigger below.
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
  -- Idempotent appends: the same provider event (and entry type) is recorded
  -- at most once, so a replayed webhook cannot double-count a capture.
  unique (provider, provider_event_id, entry_type)
);
create index if not exists payment_ledger_workspace_idx
  on public.payment_ledger (workspace_id, occurred_at desc);

alter table public.payment_ledger enable row level security;

-- Members may read their own workspace's ledger; writes are service-role only.
grant select on public.payment_ledger to authenticated;
grant all on public.payment_ledger to service_role;
revoke insert, update, delete on public.payment_ledger from authenticated, anon;
create policy "members read payment ledger" on public.payment_ledger
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Enforce append-only at the database level (defense in depth): reject any
-- UPDATE or DELETE even from a privileged role.
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
