begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  insert into public.profiles (
    id,
    name,
    email,
    role,
    status
  ) values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'User'), '@', 1)
    ),
    coalesce(new.email, ''),
    'resident',
    'active'
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

create or replace function public.current_aquaguard_role()
returns text
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select role
  from public.profiles
  where id = auth.uid();
$function$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

revoke execute on function public.current_aquaguard_role() from public;
revoke execute on function public.current_aquaguard_role() from anon;
grant execute on function public.current_aquaguard_role() to authenticated;

commit;