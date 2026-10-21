-- ========== super admin role ==========
-- Adds a distinct super_admin tier. Only a super admin may grant the admin
-- role; both admins and super admins may moderate (suspend) users.
--
-- NOTE: kept in its own migration so the new enum value is committed before
-- it is referenced (Postgres forbids using a new enum value in the same
-- transaction that adds it).

alter type public.app_role add value if not exists 'super_admin';
