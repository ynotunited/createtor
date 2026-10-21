-- 0015_free_monthly_credits.sql
-- Monthly free-credit allotment.
--
-- The free plan promises "1,000 credits every month" (see src/lib/pricing.ts),
-- but credits were only granted once at signup (and as a floor on downgrade), so
-- a free user who spent them never received another allotment. This adds a
-- period marker and an idempotent claim function that tops a free workspace back
-- up to the monthly floor at most once per calendar month (no rollover).

alter table public.usage_credits
  add column if not exists free_grant_at timestamptz not null default now();

-- Tops a free workspace up to the monthly allotment and returns the amount
-- granted (0 when nothing was owed). Safe to call before any balance check;
-- paid workspaces, workspaces already granted this month, and workspaces already
-- at/above the floor are no-ops.
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

  -- Serialize concurrent claims for the same workspace so the allotment is
  -- granted exactly once per period even under parallel requests.
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
    -- The bootstrap owns initial credit creation.
    return 0;
  end if;

  if date_trunc('month', _last) >= date_trunc('month', now()) then
    return 0;
  end if;

  if _balance >= _credits then
    -- Already at/above the floor; just advance the period marker.
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
