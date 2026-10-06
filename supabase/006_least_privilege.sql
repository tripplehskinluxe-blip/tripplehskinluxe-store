-- Run AFTER 005. PRINCIPLE OF LEAST PRIVILEGE.
-- Before this file, Supabase's defaults gave the public-facing roles (anon = not signed in, authenticated = any signed-in user)
-- every right on every table, and only Row Level Security (RLS) held the line. Now there are TWO layers:
--   layer 1 (this file): each role is granted only the exact operations it needs, on only the tables it needs;
--   layer 2 (RLS policies): even those operations only touch the rows the person is allowed to see.
-- Whoever you are, a mistake in one layer is caught by the other.

-- ---------- 1) take everything away from the public-facing roles ----------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- New tables / functions created later start with NO access for these roles (you must grant on purpose).
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
-- Functions: Postgres lets everybody run a NEW function by default, and a schema-level setting cannot turn that off.
-- So every migration that adds a function revokes it explicitly, and test 40 fails if anon or a customer can run anything unexpected.

-- ---------- 2) policies: say WHICH role each one is for, so anon never has to run an admin helper ----------
drop policy if exists audit_admin             on public.audit_log;
drop policy if exists categories_admin        on public.categories;
drop policy if exists categories_read         on public.categories;
drop policy if exists contact_staff_read      on public.contact_messages;
drop policy if exists contact_staff_update    on public.contact_messages;
drop policy if exists customers_select        on public.customers;
drop policy if exists discounts_admin         on public.discounts;
drop policy if exists newsletter_admin_read   on public.newsletter_subscribers;
drop policy if exists order_items_select      on public.order_items;
drop policy if exists orders_select           on public.orders;
drop policy if exists pages_admin             on public.pages;
drop policy if exists pages_read              on public.pages;
drop policy if exists products_admin          on public.products;
drop policy if exists products_read           on public.products;
drop policy if exists profiles_admin_all      on public.profiles;
drop policy if exists profiles_select         on public.profiles;
drop policy if exists profiles_update_self    on public.profiles;
drop policy if exists reviews_admin           on public.reviews;
drop policy if exists reviews_read            on public.reviews;
drop policy if exists settings_admin          on public.settings;
drop policy if exists settings_read           on public.settings;
drop policy if exists stock_movements_select  on public.stock_movements;

-- public shop content (visitors who are not signed in)
create policy categories_read       on public.categories for select to anon, authenticated using (true);
create policy pages_read            on public.pages      for select to anon, authenticated using (true);
create policy settings_read         on public.settings   for select to anon, authenticated using (true);
create policy products_read_public  on public.products   for select to anon using (is_active);
create policy reviews_read_public   on public.reviews    for select to anon using (status = 'published');

-- signed-in people
create policy products_read_auth    on public.products   for select to authenticated using (is_active or public.is_staff());
create policy reviews_read_auth     on public.reviews    for select to authenticated using (status = 'published' or public.is_staff());
create policy customers_select      on public.customers  for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy orders_select         on public.orders     for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy order_items_select    on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));
create policy stock_movements_select on public.stock_movements for select to authenticated using (public.is_staff());
create policy contact_staff_read    on public.contact_messages for select to authenticated using (public.is_staff());
create policy contact_staff_update  on public.contact_messages for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy profiles_select       on public.profiles   for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_self  on public.profiles   for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- admin only (two-factor enforced inside is_admin())
create policy audit_admin           on public.audit_log  for select to authenticated using (public.is_admin());
create policy newsletter_admin_read on public.newsletter_subscribers for select to authenticated using (public.is_admin());
create policy categories_admin      on public.categories for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_admin        on public.products   for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy discounts_admin       on public.discounts  for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy reviews_admin         on public.reviews    for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pages_admin           on public.pages      for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy profiles_admin_update on public.profiles   for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- settings have NO write policy at all: they can only be changed through save_setting() (see 007), which re-checks admin + two-factor.

-- ---------- 3) grants: only the operations each role really needs ----------
-- not signed in: read-only, public shop content only
grant select on public.categories, public.products, public.reviews, public.settings, public.pages to anon;

-- signed in (customers, staff and admins all use this role; the policies above decide who sees which rows)
grant select on public.categories, public.products, public.reviews, public.settings, public.pages,
                public.profiles, public.customers, public.orders, public.order_items, public.stock_movements,
                public.discounts, public.audit_log, public.contact_messages, public.newsletter_subscribers to authenticated;
-- writes (admin-only through the policies; a customer holding these grants still cannot use them)
grant insert, update, delete on public.categories, public.products, public.discounts, public.pages to authenticated;
grant insert, update, delete on public.reviews to authenticated;                -- customers: insert their own pending review; admin: moderate
grant update (full_name, phone) on public.profiles to authenticated;            -- NEVER the role column: roles change only in the Supabase SQL editor
grant update (handled) on public.contact_messages to authenticated;

-- orders, order_items, customers, stock_movements, settings, audit_log: no write grants for anyone but the server's trusted functions.

-- ---------- 4) functions ----------
do $$
declare r record;
begin
  -- the browser (signed-in team) may call only these
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any (array['is_staff','is_admin','record_pos_sale','set_order_status','adjust_stock','set_stock_count']) loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
-- the server (service_role key, never in the browser) may call every function
grant execute on all functions in schema public to service_role;
-- internal helpers and triggers: nobody calls these directly
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any (array['handle_new_user','refresh_product_rating','touch_page','norm_phone','next_order_number']) loop
    execute format('revoke execute on function %s from service_role', r.sig);
  end loop;
end $$;

-- ---------- 5) the server's own role (service_role) ----------
-- Supabase projects created from April 2026 can be set up so that NEW tables are granted to nobody automatically.
-- The website's server and the Railway listener use service_role, so grant it what it needs explicitly instead of relying on a default.
-- (service_role is the trusted server-only key. It is never in the browser, and it ignores row rules by design.)
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
