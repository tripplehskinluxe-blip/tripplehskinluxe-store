-- Run AFTER 012. Lets an admin allow chosen STAFF members to add and edit products.
--   * OFF by default for every staff member. Only an admin (signed in with two-factor) can switch it on or off, per person;
--   * with it on, staff can add and edit products and upload product photos. They still CANNOT delete anything, import CSV files,
--     change categories or settings, or change this permission, not even their own;
--   * it is checked HERE, in the database, so it holds even if the website code had a bug;
--   * every product change made by a person is written to the audit log (who, what, old and new price / stock);
--   * removing someone from the team switches their permission off.
-- Safe to run more than once.

alter table public.profiles add column if not exists can_manage_products boolean not null default false;
-- (the role/permission columns are not in the columns people may update on their own profile, so nobody can grant themselves anything)

create or replace function public.can_edit_products() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.is_staff() and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and can_manage_products))
$$;
revoke execute on function public.can_edit_products() from public, anon;
grant  execute on function public.can_edit_products() to authenticated;            -- the rules below call it; it only ever answers about the caller

-- products: write = admin or permitted staff; delete = admin only
drop policy if exists products_admin  on public.products;
drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;
create policy products_insert on public.products for insert to authenticated with check (public.can_edit_products());
create policy products_update on public.products for update to authenticated using (public.can_edit_products()) with check (public.can_edit_products());
create policy products_delete on public.products for delete to authenticated using (public.is_admin());

-- product photos: upload / replace = admin or permitted staff; delete = admin only
drop policy if exists "admins upload product images" on storage.objects;
drop policy if exists "admins update product images" on storage.objects;
create policy "product editors upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'products' and public.can_edit_products());
create policy "product editors update product images" on storage.objects for update to authenticated
  using (bucket_id = 'products' and public.can_edit_products()) with check (bucket_id = 'products' and public.can_edit_products());

-- the team list now also says who has the permission
drop function if exists public.team_list();
create or replace function public.team_list()
returns table (id uuid, email text, role text, full_name text, created_at timestamptz, last_sign_in_at timestamptz, can_manage_products boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, p.role, p.full_name, u.created_at, u.last_sign_in_at, p.can_manage_products
    from public.profiles p join auth.users u on u.id = p.id
    where p.role in ('staff', 'admin')
    order by (p.role = 'admin') desc, u.created_at;
end $$;
revoke execute on function public.team_list() from public, anon;
grant  execute on function public.team_list() to authenticated;

-- switch the permission on or off for ONE staff member
create or replace function public.team_set_products(p_user uuid, p_can boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_can is null then raise exception 'choose on or off'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'you cannot do this to your own account'; end if;
  select role into r from public.profiles where id = p_user for update;
  if not found or r <> 'staff' then raise exception 'that person is not a staff member'; end if;
  update public.profiles set can_manage_products = p_can where id = p_user;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'team_set_products', 'profiles', p_user::text, jsonb_build_object('allowed', p_can));
end $$;
revoke execute on function public.team_set_products(uuid, boolean) from public, anon;
grant  execute on function public.team_set_products(uuid, boolean) to authenticated;   -- re-checks admin + two-factor inside

-- losing staff access also switches the permission off (so it can never come back by surprise)
create or replace function public.team_set_role(p_user uuid, p_from text, p_to text) returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not ((p_from = 'customer' and p_to = 'staff') or (p_from = 'staff' and p_to = 'customer')) then raise exception 'that role change is not allowed here'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'you cannot do this to your own account'; end if;
  select role into r from public.profiles where id = p_user for update;
  if not found or r <> p_from then raise exception 'that person does not have the expected role'; end if;
  update public.profiles set role = p_to, can_manage_products = false where id = p_user;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'team_set_role', 'profiles', p_user::text, jsonb_build_object('from', p_from, 'to', p_to));
end $$;
revoke execute on function public.team_set_role(uuid, text, text) from public, anon;
grant  execute on function public.team_set_role(uuid, text, text) to authenticated;

-- who changed what: every product change made by a signed-in person is logged (imports by the server are logged by the import itself)
create or replace function public.products_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor, action, entity, entity_id, meta)
    values (auth.uid(), 'product_create', 'products', new.id::text, jsonb_build_object('name', new.name, 'price', new.price_ngn));
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (actor, action, entity, entity_id, meta)
    values (auth.uid(), 'product_update', 'products', new.id::text, jsonb_build_object('name', new.name,
      'price', jsonb_build_array(old.price_ngn, new.price_ngn), 'stock', jsonb_build_array(old.stock, new.stock), 'active', jsonb_build_array(old.is_active, new.is_active)));
  else
    insert into public.audit_log (actor, action, entity, entity_id, meta) values (auth.uid(), 'product_delete', 'products', old.id::text, jsonb_build_object('name', old.name));
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.products_audit() from public, anon, authenticated;
drop trigger if exists products_audit on public.products;
create trigger products_audit after insert or update or delete on public.products for each row execute function public.products_audit();
