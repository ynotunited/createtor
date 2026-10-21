-- 0026_pii_retention_and_erasure.sql
-- Closes two data-protection gaps:
--
--   1. RETENTION. `error_issues` (0020) and `analytics_events` (0020) grew
--      without bound because only `rate_limits` and `security_events` were ever
--      scheduled (0016). `audit_logs` had no purge function at all. This adds a
--      `purge_audit_logs` helper and schedules the three missing jobs through
--      pg_cron (guarded, best-effort; the functions stay callable by hand or by
--      an external scheduler).
--
--   2. ERASURE (right to be forgotten / DSAR). There was no way to fulfil the
--      promise in the privacy policy that deleting an account removes or
--      de-identifies personal data. `erase_user_data` performs the whole
--      database-side erasure in one transaction: owned workspaces (and their
--      cascaded content) are removed, the profile is de-identified, role and
--      membership rows are dropped, and every telemetry row that referenced the
--      user is detached (`user_id = null`) with its metadata blanked.
--
-- NOT erased: `payment_ledger` is append-only (0017) and retained as a financial
-- record. It holds no direct identifier beyond `provider_customer_id`; the app
-- nulls that via a controlled path only if legally required. `audit_logs` rows
-- for workspaces the user did not own are detached, not deleted, so the audit
-- trail of other tenants stays intact.

-- ---------------------------------------------------------------- retention
create or replace function public.purge_audit_logs(_older_than_days integer default 365)
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
  delete from public.audit_logs where created_at < now() - make_interval(days => _older_than_days);
  get diagnostics _deleted = row_count;
  return _deleted;
end;
$$;

revoke all on function public.purge_audit_logs(integer) from public, anon, authenticated;
grant execute on function public.purge_audit_logs(integer) to service_role;

-- Schedule retention for the three tables that had none. Best-effort: pg_cron
-- may be unavailable; every step is guarded so the migration still succeeds.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule(
        'purge_error_issues_weekly',
        '41 4 * * 0',
        $cmd$select public.purge_error_issues(180)$cmd$
      );
    exception when others then
      raise notice 'could not schedule error-issue retention: %', sqlerrm;
    end;

    begin
      perform cron.schedule(
        'purge_analytics_events_monthly',
        '47 4 1 * *',
        $cmd$select public.purge_analytics_events(400)$cmd$
      );
    exception when others then
      raise notice 'could not schedule analytics retention: %', sqlerrm;
    end;

    begin
      perform cron.schedule(
        'purge_audit_logs_daily',
        '53 4 * * *',
        $cmd$select public.purge_audit_logs(365)$cmd$
      );
    exception when others then
      raise notice 'could not schedule audit-log retention: %', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not available; retention must be scheduled externally.';
  end if;
end $$;

-- ------------------------------------------------------------------ erasure
-- Erases a single user's personal data. Service-role only: the caller must have
-- independently verified the request (self-service: the signed-in user's own id;
-- admin: an authorised operator). Returns a JSON summary of what was removed.
create or replace function public.erase_user_data(_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _short text;
  _placeholder_email text;
  _owned_workspaces integer := 0;
  _memberships integer := 0;
  _roles integer := 0;
  _checkouts integer := 0;
  _sec_events integer := 0;
  _analytics integer := 0;
  _issues integer := 0;
  _audits integer := 0;
  _profile integer := 0;
begin
  if _user_id is null then
    raise exception 'user id is required';
  end if;

  -- Serialize concurrent erasures for the same user.
  perform pg_advisory_xact_lock(hashtext('erase_user:' || _user_id::text)::bigint);

  -- 1. Owned workspaces. Everything workspace-scoped cascades from here
  --    (projects, scenes, media, scripts, jobs, credits, audit_rows for those
  --    workspaces, ...), so this removes the bulk of the user's content.
  with deleted as (
    delete from public.workspaces where owner_id = _user_id returning id
  )
  select count(*) into _owned_workspaces from deleted;

  -- 2. Memberships in workspaces owned by others (their content is not ours to
  --    delete; the user simply loses access).
  with deleted as (
    delete from public.workspace_members where user_id = _user_id returning id
  )
  select count(*) into _memberships from deleted;

  -- 3. Roles.
  with deleted as (
    delete from public.user_roles where user_id = _user_id returning id
  )
  select count(*) into _roles from deleted;

  -- 4. Checkout idempotency records (link a user to a checkout attempt).
  with deleted as (
    delete from public.checkout_intents where user_id = _user_id returning id
  )
  select count(*) into _checkouts from deleted;

  -- 5. Telemetry: detach the identity and blank the free-form metadata. The
  --    security rows are retained for abuse forensics but no longer identify
  --    the person.
  with updated as (
    update public.security_events
       set user_id = null, metadata = '{}'::jsonb, path = null
     where user_id = _user_id
     returning id
  )
  select count(*) into _sec_events from updated;

  with updated as (
    update public.analytics_events
       set user_id = null, props = '{}'::jsonb, path = null
     where user_id = _user_id
     returning id
  )
  select count(*) into _analytics from updated;

  with updated as (
    update public.error_issues
       set user_id = null, workspace_id = null, metadata = '{}'::jsonb
     where user_id = _user_id
     returning id
  )
  select count(*) into _issues from updated;

  -- Audit rows for workspaces the user did NOT own survive (other tenants'
  -- trail), but are detached from the erased person.
  with updated as (
    update public.audit_logs
       set user_id = null, metadata = '{}'::jsonb
     where user_id = _user_id
     returning id
  )
  select count(*) into _audits from updated;

  -- 6. De-identify the profile row in place. It is kept (rather than deleted)
  --    so any historical FK still resolves, but it carries no personal data.
  _short := substr(replace(_user_id::text, '-', ''), 1, 12);
  _placeholder_email := 'deleted+' || _short || '@invalid.local';
  with updated as (
    update public.profiles
       set email = _placeholder_email,
           full_name = null,
           avatar_url = null,
           timezone = 'UTC'
     where id = _user_id
     returning id
  )
  select count(*) into _profile from updated;

  return jsonb_build_object(
    'user_id', _user_id,
    'owned_workspaces', _owned_workspaces,
    'memberships', _memberships,
    'roles', _roles,
    'checkout_intents', _checkouts,
    'security_events', _sec_events,
    'analytics_events', _analytics,
    'error_issues', _issues,
    'audit_logs', _audits,
    'profile_updated', _profile
  );
end;
$$;

revoke all on function public.erase_user_data(uuid) from public, anon, authenticated;
grant execute on function public.erase_user_data(uuid) to service_role;
