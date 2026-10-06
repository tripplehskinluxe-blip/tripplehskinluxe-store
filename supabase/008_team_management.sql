-- Run AFTER 007. Lets an admin manage STAFF accounts from the team area (add, reset password, remove).
-- The limits are enforced HERE, in the database, so they hold even if the website code had a bug:
--   * only an admin who signed in with the authenticator code can call these functions;
--   * the only role changes possible are customer -> staff and staff -> customer. NOBODY can be made an admin here,
--     and an admin account can never be changed, demoted or removed from the website. Admins are managed in Supabase only;
--   * nobody can act on their own account;
--   * every action is written to the audit log.

-- List the team (staff + admins) with their emails.
create or replace function public.team_list()
returns table (id uuid, email text, role text, full_name text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, p.role, p.full_name, u.created_at, u.last_sign_in_at
    from public.profiles p join auth.users u on u.id = p.id
    where p.role in ('staff', 'admin')
    order by (p.role = 'admin') desc, u.created_at;
end $$;

-- Before the server changes a STAFF member's password or authenticator: is this allowed? (raises if not; logs it if yes)
create or replace function public.team_check_target(p_user uuid, p_expected_role text, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_expected_role is distinct from 'staff' then raise exception 'only staff accounts can be managed here'; end if;
  if p_action is null or p_action not in ('reset_password', 'reset_mfa') then raise exception 'unknown action'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'you cannot do this to your own account'; end if;
  select role into r from public.profiles where id = p_user;
  if not found or r <> 'staff' then raise exception 'that person is not a staff member'; end if;
  insert into public.audit_log (actor, action, entity, entity_id, meta) values (auth.uid(), 'team_' || p_action, 'profiles', p_user::text, '{}'::jsonb);
end $$;

-- The only two role changes the website can make.
create or replace function public.team_set_role(p_user uuid, p_from text, p_to text) returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not ((p_from = 'customer' and p_to = 'staff') or (p_from = 'staff' and p_to = 'customer')) then raise exception 'that role change is not allowed here'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'you cannot do this to your own account'; end if;
  select role into r from public.profiles where id = p_user for update;
  if not found or r <> p_from then raise exception 'that person does not have the expected role'; end if;
  update public.profiles set role = p_to where id = p_user;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'team_set_role', 'profiles', p_user::text, jsonb_build_object('from', p_from, 'to', p_to));
end $$;

revoke execute on function public.team_list()                          from public, anon;
revoke execute on function public.team_check_target(uuid, text, text) from public, anon;
revoke execute on function public.team_set_role(uuid, text, text)     from public, anon;
grant  execute on function public.team_list()                          to authenticated;   -- each re-checks admin + two-factor inside
grant  execute on function public.team_check_target(uuid, text, text) to authenticated;
grant  execute on function public.team_set_role(uuid, text, text)     to authenticated;
