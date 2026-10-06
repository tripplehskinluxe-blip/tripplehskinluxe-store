-- Least-privilege checks. Every check prints "ok ..." or "FAIL ...".
\pset tuples_only on
create or replace function pg_temp.expect(label text, actual text, expected text) returns void language plpgsql as $$
begin if actual is not distinct from expected then raise notice 'ok  %', label; else raise notice 'FAIL % (got %, wanted %)', label, actual, expected; end if; end $$;
create or replace function pg_temp.as_(uid text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',uid,'aal',aal)::text, false); end $$;
create or replace function pg_temp.denied(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was allowed)', label; exception when insufficient_privilege then raise notice 'ok  % (permission denied)', label; when others then raise notice 'FAIL % (wrong error: %)', label, sqlerrm; end; end $$;

insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','a@x'),('00000000-0000-0000-0000-0000000000b1','s@x'),('00000000-0000-0000-0000-0000000000c1','c@x');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='staff' where id='00000000-0000-0000-0000-0000000000b1';
insert into public.categories(name,slug) values ('Skincare','skincare');
insert into public.products (sku,slug,name,brand,price_ngn,stock,is_active) values ('S1','s1','Serum','B',10000,5,true),('H1','h1','Hidden','B',500,5,false);
insert into public.orders(order_number,channel,payment_method,subtotal_ngn,total_ngn,customer_name) values ('ONL-2026-9001','online','paystack',100,100,'G');
insert into public.reviews(product_id,name,rating,body,status) select id,'R',5,'good','published' from public.products where sku='S1';
insert into public.reviews(product_id,name,rating,body,status) select id,'R',1,'pending','pending' from public.products where sku='S1';

\echo --- NOT SIGNED IN (anon): exactly SELECT on five public tables, nothing else
select pg_temp.expect('anon holds nothing except SELECT on categories/products/reviews/settings/pages',
  (select count(*)::text from information_schema.role_table_grants where grantee='anon' and table_schema='public'
     and not (privilege_type='SELECT' and table_name in ('categories','products','reviews','settings','pages'))), '0');
select pg_temp.expect('anon can run ZERO database functions',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon', p.oid, 'execute')), '0');
set role anon;
select pg_temp.expect('anon sees the active product only', (select string_agg(sku, ',') from public.products), 'S1');
select pg_temp.expect('anon sees the published review only', (select count(*)::text from public.reviews), '1');
select pg_temp.denied('anon cannot read orders', 'select * from public.orders');
select pg_temp.denied('anon cannot read customers', 'select * from public.customers');
select pg_temp.denied('anon cannot read profiles', 'select * from public.profiles');
select pg_temp.denied('anon cannot read discounts', 'select * from public.discounts');
select pg_temp.denied('anon cannot read audit log', 'select * from public.audit_log');
select pg_temp.denied('anon cannot insert an order', $q$insert into public.orders(order_number,channel,payment_method,subtotal_ngn,total_ngn) values ('X','online','paystack',1,1)$q$);
select pg_temp.denied('anon cannot change a price', 'update public.products set price_ngn = 1');
select pg_temp.denied('anon cannot delete products', 'delete from public.products');
select pg_temp.denied('anon cannot empty a table (TRUNCATE)', 'truncate public.orders');
select pg_temp.denied('anon cannot change settings', $q$insert into public.settings(key,value) values ('delivery','{}')$q$);
reset role;

\echo --- SIGNED IN customer
select pg_temp.expect('no signed-in user holds TRUNCATE / REFERENCES / TRIGGER anywhere',
  (select count(*)::text from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')), '0');
select pg_temp.expect('signed-in users cannot write orders, order_items, customers, stock, settings, audit log, newsletter',
  (select count(*)::text from information_schema.role_table_grants where grantee='authenticated' and table_schema='public'
     and table_name in ('orders','order_items','customers','stock_movements','settings','audit_log','newsletter_subscribers')
     and privilege_type in ('INSERT','UPDATE','DELETE')), '0');
select pg_temp.expect('profiles ROLE column cannot be updated by any signed-in user', has_column_privilege('authenticated','public.profiles','role','update')::text, 'false');
select pg_temp.expect('profiles full_name can be updated', has_column_privilege('authenticated','public.profiles','full_name','update')::text, 'true');
select pg_temp.expect('signed-in users can run ONLY the 12 intended functions',
  (select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('authenticated', p.oid, 'execute')),
  'adjust_stock,get_security_config,is_admin,is_staff,record_pos_sale,save_security_config,save_setting,set_order_status,set_stock_count,team_check_target,team_list,team_set_role');
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal1');
set role authenticated;
select pg_temp.denied('customer cannot insert an order (privilege, not just policy)', $q$insert into public.orders(order_number,channel,payment_method,subtotal_ngn,total_ngn) values ('X','online','paystack',1,1)$q$);
select pg_temp.denied('customer cannot promote self to admin (column privilege)', $q$update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000c1'$q$);
reset role;
insert into public.discounts(code,type,value,min_order_ngn) values ('SECRET10','percent',10,0);
set role authenticated;
select pg_temp.expect('customer gets ZERO rows from discounts / audit log / newsletter / customers (RLS)',
  (select count(*)::text from public.discounts) || '/' || (select count(*)::text from public.audit_log) || '/' || (select count(*)::text from public.newsletter_subscribers) || '/' || (select count(*)::text from public.customers), '0/0/0/0');
select pg_temp.denied('customer cannot run create_online_order', $q$select public.create_online_order('{}'::jsonb)$q$);
select pg_temp.denied('customer cannot run mark_order_paid', $q$select public.mark_order_paid('x',1)$q$);
select pg_temp.expect('customer sees no one elses orders', (select count(*)::text from public.orders), '0');
select pg_temp.expect('customer still sees active products + published review', (select count(*)::text from public.products) || '/' || (select count(*)::text from public.reviews), '1/1');
update public.profiles set full_name='Ada' where id='00000000-0000-0000-0000-0000000000c1';
select pg_temp.expect('customer can edit own name', (select full_name from public.profiles where id='00000000-0000-0000-0000-0000000000c1'), 'Ada');
reset role;

\echo --- TEAM (admin with two-factor) keeps what it needs
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2');
set role authenticated;
update public.products set price_ngn = 11000 where sku='S1';
select pg_temp.expect('admin (2FA) can edit products', (select price_ngn::text from public.products where sku='S1'), '11000');
select pg_temp.expect('admin (2FA) sees orders', (select count(*)::text from public.orders), '1');
select pg_temp.expect('admin (2FA) sees hidden product + pending review', (select count(*)::text from public.products) || '/' || (select count(*)::text from public.reviews), '2/2');
select pg_temp.denied('admin cannot change anyone''s role through the API (column privilege)', $q$update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000c1'$q$);
select pg_temp.denied('admin cannot delete an order through the API', 'delete from public.orders');
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal1');
set role authenticated;
update public.products set price_ngn = 1 where sku='S1';
reset role;
select pg_temp.expect('admin WITHOUT two-factor cannot edit products', (select price_ngn::text from public.products where sku='S1'), '11000');


\echo --- the server's own role must KEEP what it needs (otherwise the shop would stop working)
select pg_temp.expect('service_role can read/write EVERY table (the server uses these directly)',
  (select bool_and(has_table_privilege('service_role', c.oid, 'select') and has_table_privilege('service_role', c.oid, 'insert') and has_table_privilege('service_role', c.oid, 'update') and has_table_privilege('service_role', c.oid, 'delete'))::text
     from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'), 'true');
select pg_temp.expect('service_role can use the public schema', has_schema_privilege('service_role', 'public', 'usage')::text, 'true');
select pg_temp.expect('service_role can run the payment and email functions',
  (select bool_and(has_function_privilege('service_role', p.oid, 'execute'))::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('create_online_order','mark_order_paid','claim_confirmation_email','release_confirmation_email','claim_status_email','release_status_email')), 'true');

\echo --- future tables start locked
create table public.zz_future (id int);
select pg_temp.expect('a table created later gives anon/authenticated NO access by default',
  (select count(*)::text from information_schema.role_table_grants where table_name='zz_future' and grantee in ('anon','authenticated')), '0');
drop table public.zz_future;
