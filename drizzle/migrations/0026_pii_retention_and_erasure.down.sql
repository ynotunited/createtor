-- 0026_pii_retention_and_erasure.down.sql
-- Reverses 0026. The scheduled jobs are removed first, then the two functions.
-- Nothing that was erased can be restored by this script; it only removes the
-- new capability and stops the new retention jobs.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('purge_audit_logs_daily');
    exception when others then
      raise notice 'could not unschedule audit-log retention: %', sqlerrm;
    end;
    begin
      perform cron.unschedule('purge_analytics_events_monthly');
    exception when others then
      raise notice 'could not unschedule analytics retention: %', sqlerrm;
    end;
    begin
      perform cron.unschedule('purge_error_issues_weekly');
    exception when others then
      raise notice 'could not unschedule error-issue retention: %', sqlerrm;
    end;
  end if;
end $$;

drop function if exists public.erase_user_data(uuid);
drop function if exists public.purge_audit_logs(integer);
