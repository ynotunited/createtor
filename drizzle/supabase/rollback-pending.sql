-- ============================================================================
--  UNDO / ROLLBACK (PENDING BATCH)  ->  Supabase  ->  SQL Editor  ->  Run
--
--  Reverses everything `apply-pending.sql` did:
--    0013  security_events + purge_security_events()
--    0014  ensure_workspace()
--    0015  claim_free_monthly_credits() + usage_credits.free_grant_at
--    0017  checkout_intents + payment_ledger + append-only trigger
--    0019  peek_rate_limit() + clear_rate_limit()
--    0020  error_issues + analytics_events + helpers
--
--  WARNING: this DROPS tables and their data (security_events,
--  checkout_intents, payment_ledger, error_issues, analytics_events) and drops
--  the free_grant_at column from usage_credits. Run only if you want to go back
--  to exactly how things were before the pending batch.
--
--  Safe to run more than once.
-- ============================================================================

-- 0020
drop function if exists public.purge_analytics_events(integer);
drop function if exists public.purge_error_issues(integer);
drop function if exists public.record_error_issue(text, text, text, text, text, text, uuid, uuid, text, jsonb);
drop table if exists public.analytics_events;
drop table if exists public.error_issues;

-- 0019
drop function if exists public.clear_rate_limit(text);
drop function if exists public.peek_rate_limit(text, integer);

-- 0017
drop trigger if exists payment_ledger_immutable on public.payment_ledger;
drop function if exists public.reject_payment_ledger_mutation();
drop policy if exists "members read payment ledger" on public.payment_ledger;
drop table if exists public.payment_ledger;
drop table if exists public.checkout_intents;

-- 0015
drop function if exists public.claim_free_monthly_credits(uuid, integer);
alter table public.usage_credits drop column if exists free_grant_at;

-- 0014
drop function if exists public.ensure_workspace(uuid, text, integer);

-- 0013
drop function if exists public.purge_security_events(integer);
drop table if exists public.security_events;
