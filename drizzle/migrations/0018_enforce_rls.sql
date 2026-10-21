-- ========== RLS: fail closed on every table, now and in future ==========

-- Row Level Security is OFF by default for tables created with raw SQL, and
-- Supabase's default privileges grant new tables in `public` to `anon` and
-- `authenticated`. A hand-written `create table` can therefore ship a readable,
-- writable table with no policies. This migration closes that gap in three ways.

-- 1) Sweep: enable RLS on any public table that does not already have it
--    (idempotent, and re-runnable after new tables appear).
do $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r','p')
       and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'RLS enabled on public.%', t.relname;
  end loop;
end $$;

-- 2) Privileges: unauthenticated callers get nothing by default; the only
--    public-readable data (system templates) is granted back explicitly. Tables
--    from this work (checkout_intents, payment_ledger) are already service-role
--    only / member-read.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
grant select on public.templates to anon;
revoke create on schema public from anon, authenticated;

-- 3) Guard: automatically enable RLS and drop anon access on every table created
--    in public from now on, so a future raw `create table` cannot reintroduce the
--    gap. Event triggers require elevated privileges; if this environment cannot
--    create one the block is skipped (the sweep above still covers shipped tables).
create or replace function public.harden_new_public_table()
returns event_trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands()
  loop
    if cmd.command_tag = 'CREATE TABLE' and cmd.schema_name = 'public' then
      execute format('alter table %s enable row level security', cmd.object_identity);
      execute format('revoke all on %s from anon', cmd.object_identity);
      raise notice 'RLS hardened on new table %', cmd.object_identity;
    end if;
  end loop;
end;
$$;

do $$
begin
  create event trigger harden_new_public_table
    on ddl_command_end
    when tag in ('CREATE TABLE')
    execute function public.harden_new_public_table();
exception
  when duplicate_object then null;
  when insufficient_privilege then
    raise notice 'Skipping RLS event trigger: current role lacks privilege.';
  when feature_not_supported then
    raise notice 'Skipping RLS event trigger: not supported here.';
end $$;

-- Note: the service role keeps BYPASSRLS, so server-side writes (billing, credits,
-- ledger) continue to work while clients remain bound by RLS.
