-- migrate:no-transaction
-- ========== ROLLBACK for 0024_autopilot_guards ==========
-- Removes the database backstops for the Daily Queue. The application already
-- clamps and re-derives entitlement server-side, so code does not need to be
-- reverted for this rollback to be safe.

drop trigger if exists autopilot_entitlement_guard on public.autopilot_configs;
drop function if exists public.enforce_autopilot_entitlement();

drop function if exists public.claim_first_admin(uuid);

alter table public.autopilot_configs drop constraint if exists autopilot_videos_per_week_range;
alter table public.autopilot_configs drop constraint if exists autopilot_duration_range;
