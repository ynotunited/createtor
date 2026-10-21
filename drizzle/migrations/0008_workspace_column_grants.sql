-- ========== workspaces: lock down write access ==========
-- A column-level REVOKE has no effect while a table-level UPDATE grant exists
-- (Postgres semantics), so the plan-column revoke in 0007 was a no-op. Drop the
-- table-level write grants entirely and re-grant only the column members may
-- edit. Workspace creation now runs server-side (service role), so the client
-- no longer needs INSERT or DELETE either.

revoke insert, update, delete on public.workspaces from authenticated;
grant update (name) on public.workspaces to authenticated;
