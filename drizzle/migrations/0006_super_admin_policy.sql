-- ========== super admin promotion + combined admin policy ==========
-- Promote the bootstrap admin(s) to super_admin. Guarded so it only runs
-- while no super admin exists yet, making the file safe to re-run.
update public.user_roles
set role = 'super_admin'
where role = 'admin'
  and not exists (select 1 from public.user_roles where role = 'super_admin');

-- Helper: true for any platform admin (admin or super_admin).
create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin', 'super_admin')
  )
$$;

-- Re-point every admin policy at the combined helper so super admins are
-- covered everywhere regular admins were.
drop policy if exists "admins read roles" on public.user_roles;
create policy "admins read roles" on public.user_roles for select to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "admins read system settings" on public.system_settings;
create policy "admins read system settings" on public.system_settings for select to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "admins manage system settings" on public.system_settings;
create policy "admins manage system settings" on public.system_settings for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles" on public.profiles for select to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "admins manage user_roles" on public.user_roles;
create policy "admins manage user_roles" on public.user_roles for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "admins read all workspaces" on public.workspaces;
create policy "admins read all workspaces" on public.workspaces for select to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "admins manage workspaces" on public.workspaces;
create policy "admins manage workspaces" on public.workspaces for update to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "admins read audit logs" on public.audit_logs;
create policy "admins read audit logs" on public.audit_logs for select to authenticated
  using (public.is_admin(auth.uid()));
