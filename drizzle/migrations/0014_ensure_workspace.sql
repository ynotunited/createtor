-- 0014_ensure_workspace.sql
-- Atomic, idempotent workspace bootstrap.
--
-- Previously the app created a workspace, its owner membership and its credit
-- rows as four independent, unchecked statements. A failure or a concurrent
-- first request could leave the owner with no usage_credits row, or lock the
-- owner out of their own workspace (no workspace_members row) — both of which
-- break credits and payments, since those paths require membership. Running
-- without a unique key on owner_id also allowed duplicate free-credit grants.
--
-- This function serializes per-user, then creates/repairs the full set in one
-- transaction: workspace + owner membership + credit balance + grant ledger.
-- It is safe to call repeatedly; credits are granted exactly once per workspace.

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

  -- Serialize concurrent bootstrap attempts for the same user so two requests
  -- cannot both create a workspace or both grant the welcome credits.
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

  -- Owner membership is required for credits, payments and RLS reads.
  insert into public.workspace_members (workspace_id, user_id, role)
  values (_ws_id, _user_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  -- Grant the free allotment only when the credit row is first created.
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
