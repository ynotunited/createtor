-- 0016_retention_schedule.sql
-- Schedules retention for the unbounded operational tables added earlier:
-- `rate_limits` (0011) and `security_events` (0013). Their purge functions exist
-- but nothing called them, so under abuse both tables would grow without bound.
--
-- Best-effort: pg_cron may be unavailable or already scheduled. Every step is
-- guarded so this migration succeeds regardless, and the purge functions remain
-- callable manually or from an external scheduler.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
    exception when others then
      raise notice 'pg_cron could not be created: %', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not available on this database; retention must be scheduled externally.';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule(
        'purge_rate_limits_hourly',
        '17 * * * *',
        $cmd$select public.purge_rate_limits(3600)$cmd$
      );
    exception when others then
      raise notice 'could not schedule rate-limit retention: %', sqlerrm;
    end;

    begin
      perform cron.schedule(
        'purge_security_events_daily',
        '23 3 * * *',
        $cmd$select public.purge_security_events(90)$cmd$
      );
    exception when others then
      raise notice 'could not schedule security-event retention: %', sqlerrm;
    end;
  end if;
end $$;
