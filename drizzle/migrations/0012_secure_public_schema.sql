-- ========== secure deployment: lock down the public schema ==========

-- 1) Fail closed on RLS. Every table this app ships already has RLS enabled
--    (see 0000/0004/0007/0011), but this also covers any table added later by
--    hand or by an upstream tool: with RLS on and no policy, access is denied
--    by default until a policy is added deliberately.
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

-- 2) The app never reads data without a signed-in user: every client query
--    carries a JWT, and unauthenticated pages (pricing, marketing) use static
--    data. Drop all anonymous privileges on public tables so a stolen publishable
--    key on its own cannot read or write business data.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

-- System templates are intentionally world-readable (public read policy).
grant select on public.templates to anon;

-- 3) Nobody but the migration tooling should create objects in public.
revoke create on schema public from anon, authenticated;

-- 4) Audit trail integrity: entries are written only by server code under the
--    service role. Authenticated clients can read their workspace's history
--    (policy from 0000/0006) but must never be able to insert or edit it, so
--    audit records cannot be forged or erased from the browser.
revoke insert, update, delete on public.audit_logs from authenticated;
