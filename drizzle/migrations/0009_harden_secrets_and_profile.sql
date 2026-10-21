-- ========== security hardening: secret storage + profile identity ==========

-- system_settings holds provider API keys and payment gateway secrets in plain
-- (is_secret = true) rows. The previous RLS policy let any admin session SELECT
-- every row through PostgREST, so a raw Stripe secret key / AI key could be read
-- from a browser (or a stolen admin token). Secrets must only ever leave the
-- server through the masked server functions, which use the service role.
--
-- Drop all client write access and expose only non-secret rows to admins.
revoke insert, update, delete on public.system_settings from authenticated;

drop policy if exists "admins read system settings" on public.system_settings;
drop policy if exists "admins manage system settings" on public.system_settings;
create policy "admins read non-secret settings" on public.system_settings
  for select to authenticated
  using (public.is_admin(auth.uid()) and is_secret = false);

-- profiles: identity fields (email) are owned by auth. Let clients edit only
-- display fields; email/profile insert is handled by the handle_new_user trigger
-- and by server functions under the service role. A column-level REVOKE requires
-- dropping the table-level UPDATE grant first (see 0008 for the same caveat).
revoke insert, update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
