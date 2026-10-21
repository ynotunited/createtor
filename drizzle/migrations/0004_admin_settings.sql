-- ========== admin: system settings + platform controls ==========

-- Global key/value configuration store. Secrets are flagged with is_secret
-- and are never returned to the browser in raw form.
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_secret boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

grant select, insert, update, delete on public.system_settings to authenticated;
grant all on public.system_settings to service_role;
alter table public.system_settings enable row level security;

create or replace function public.touch_system_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

drop trigger if exists system_settings_touch on public.system_settings;
create trigger system_settings_touch before update on public.system_settings
  for each row execute function public.touch_system_settings();

-- Admins may read/write settings through RLS as well as through the
-- service-role server client. Secret values are masked by the server layer.
drop policy if exists "admins read system settings" on public.system_settings;
create policy "admins read system settings" on public.system_settings for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage system settings" on public.system_settings;
create policy "admins manage system settings" on public.system_settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ========== workspaces: suspension controls ==========
alter table public.workspaces add column if not exists suspended boolean not null default false;
alter table public.workspaces add column if not exists suspension_reason text;

-- ========== admin read/manage policies (safety net for RLS clients) ==========
drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles" on public.profiles for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage user_roles" on public.user_roles;
create policy "admins manage user_roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins read all workspaces" on public.workspaces;
create policy "admins read all workspaces" on public.workspaces for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage workspaces" on public.workspaces;
create policy "admins manage workspaces" on public.workspaces for update to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins read audit logs" on public.audit_logs;
create policy "admins read audit logs" on public.audit_logs for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ========== seed defaults ==========
insert into public.system_settings (key, value, is_secret) values
  ('ai.google', '{"enabled": true, "model": "gemini-3.5-flash"}'::jsonb, false),
  ('ai.groq', '{"enabled": true, "model": "openai/gpt-oss-120b"}'::jsonb, false),
  ('ai.pollinations', '{"enabled": true}'::jsonb, false),
  ('platform', '{"signups_open": true, "maintenance_mode": false, "free_credits_monthly": 1000, "announcement": ""}'::jsonb, false)
on conflict (key) do nothing;
