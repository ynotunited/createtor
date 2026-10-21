# Re-establishes the auth->profiles trigger on a STAGING database after a
# `pg_restore --clean --schema=public`, which drops public.handle_new_user and
# (by cascade) the trigger that lives on auth.users. Auth triggers are not stored
# in the public schema, so they must be re-created here.
#
# Safe and idempotent: running it on a database that already has the trigger does
# nothing. Applied by scripts/db/clone-live-to-staging.ps1, and again in the
# docs/migrations.md runbook after a manual restore.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, timezone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    coalesce(nullif(new.raw_user_meta_data->>'timezone', ''), 'UTC')
  )
  on conflict (id) do nothing;
  return new;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
exception
  when undefined_table then
    raise notice 'auth.users not reachable; skipped trigger re-link';
end $$;
