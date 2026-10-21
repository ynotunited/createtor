-- 0021_duplicate_users.sql
-- Detect duplicate user accounts using a window function instead of GROUP BY.
--
-- profiles is the app-side 1:1 mirror of auth.users (see handle_new_user). While
-- the primary key prevents duplicate ids, the same person can end up with two
-- profiles when the stored email differs only by case or surrounding whitespace
-- (e.g. "Ada@Example.com" vs "ada@example.com "). Because GROUP BY collapses each
-- group to one row, it cannot return the offending rows themselves. A window
-- function computes the per-normalized-email count on every row in a single pass,
-- so the caller gets each duplicate row plus how many share its identity.

create or replace function public.find_duplicate_users()
returns table (
  id uuid,
  email text,
  full_name text,
  normalized_email text,
  duplicate_count bigint,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with normalised as (
    select
      p.id,
      p.email,
      p.full_name,
      lower(btrim(p.email)) as normalized_email,
      p.created_at,
      count(*) over (partition by lower(btrim(p.email))) as duplicate_count
    from public.profiles p
    where p.email is not null
      and btrim(p.email) <> ''
  )
  select id, email, full_name, normalized_email, duplicate_count, created_at
  from normalised
  where duplicate_count > 1
  order by duplicate_count desc, normalized_email, created_at;
$$;

revoke all on function public.find_duplicate_users() from public, anon, authenticated;
grant execute on function public.find_duplicate_users() to service_role;
