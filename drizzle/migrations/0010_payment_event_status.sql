-- ========== payments: retry-safe webhook event lifecycle ==========

-- Webhook handlers used to insert the `payment_events` row *before* running the
-- handler, so a transient failure (DB blip, provider API timeout) left the event
-- recorded as seen. The provider's retry then matched the unique key and was
-- silently dropped, permanently losing the billing effect (e.g. a paid upgrade).
--
-- Events now carry a status and are only marked `processed` after the handler
-- succeeds: `processing` while in flight, `processed` on success, `failed` (with
-- the error) so a provider retry can reclaim and reprocess it.
alter table public.payment_events
  add column if not exists status text not null default 'processed',
  add column if not exists last_error text,
  add column if not exists processed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Existing rows predate the lifecycle and were handled under the old code path,
-- so the `processed` default is the correct backfill and needs no update.

-- Reclaiming failed / stuck in-flight events filters on status + updated_at.
create index if not exists payment_events_status_idx
  on public.payment_events (provider, status, updated_at);
