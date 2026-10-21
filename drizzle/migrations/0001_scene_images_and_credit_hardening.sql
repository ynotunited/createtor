drop policy if exists "workspace members access" on public.usage_credits;
drop policy if exists "workspace members access" on public.credit_transactions;
create policy "members read credits" on public.usage_credits for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members create starter credits" on public.usage_credits for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and balance <= 200 and reserved = 0 and lifetime_purchased = 0 and lifetime_consumed = 0);
create policy "members read credit transactions" on public.credit_transactions for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.consume_credits(_workspace_id uuid, _amount integer, _reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare new_balance integer;
begin
  if not public.is_workspace_member(_workspace_id) then raise exception 'Not a member of this workspace'; end if;
  if _amount <= 0 or _amount > 1000 then raise exception 'Invalid credit amount'; end if;
  update public.usage_credits
     set balance = balance - _amount, lifetime_consumed = lifetime_consumed + _amount, updated_at = now()
   where workspace_id = _workspace_id and balance >= _amount
   returning balance into new_balance;
  if new_balance is null then raise exception 'Not enough credits'; end if;
  insert into public.credit_transactions (workspace_id, kind, amount, reason) values (_workspace_id, 'consume', _amount, _reason);
  return new_balance;
end;
$$;
revoke all on function public.consume_credits(uuid, integer, text) from public, anon;
grant execute on function public.consume_credits(uuid, integer, text) to authenticated;

create policy "workspace media read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "workspace media write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "workspace media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));