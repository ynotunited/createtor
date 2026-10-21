drop policy if exists "members create starter credits" on public.usage_credits;

create policy "members create starter credits" on public.usage_credits for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and balance <= 1000
    and reserved = 0
    and lifetime_purchased = 0
    and lifetime_consumed = 0
  );
