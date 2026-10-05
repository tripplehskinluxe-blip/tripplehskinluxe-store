\set ON_ERROR_STOP off
\pset tuples_only on
-- users
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-0000000000a1','admin@x'),('00000000-0000-0000-0000-0000000000b1','staff@x'),
 ('00000000-0000-0000-0000-0000000000c1','cust1@x'),('00000000-0000-0000-0000-0000000000c2','cust2@x');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='staff' where id='00000000-0000-0000-0000-0000000000b1';
insert into public.categories(name,slug) values ('Skincare','skincare');
insert into public.products (sku,slug,name,brand,category_id,price_ngn,stock) select 'S1','s1','Serum','B',id,10000,5 from public.categories;
insert into public.products (sku,slug,name,brand,price_ngn,stock,is_active) values ('H1','h1','Hidden','B',500,5,false);
-- two orders owned by customers (as postgres, bypassing)
insert into public.orders(order_number,channel,payment_method,subtotal_ngn,total_ngn,user_id,customer_name) values
 ('ONL-2026-9001','online','paystack',100,100,'00000000-0000-0000-0000-0000000000c1','C1'),
 ('ONL-2026-9002','online','paystack',100,100,'00000000-0000-0000-0000-0000000000c2','C2'),
 ('ONL-2026-9003','online','paystack',100,100,null,'Guest');
insert into public.contact_messages(name,email,message) values ('x','x@x','hello there');
insert into public.newsletter_subscribers(email) values ('n@x');
insert into public.reviews(product_id,name,rating,body,status) select id,'R',5,'pending one','pending' from public.products where sku='S1';

create or replace function pg_temp.as_(uid text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',uid,'aal',aal)::text, false); end $$;
create or replace function pg_temp.cnt(t text) returns text language plpgsql as $$
declare n bigint; begin execute format('select count(*) from public.%I', t) into n; return n::text; exception when others then return 'DENIED('||sqlstate||')'; end $$;

\echo ===== ANON (public internet, anon key) =====
set role anon;
select 'anon sees  orders=' || pg_temp.cnt('orders') || ' order_items=' || pg_temp.cnt('order_items') || ' customers=' || pg_temp.cnt('customers') || ' profiles=' || pg_temp.cnt('profiles') || ' stock_movements=' || pg_temp.cnt('stock_movements') || ' discounts=' || pg_temp.cnt('discounts') || ' audit_log=' || pg_temp.cnt('audit_log') || ' contact=' || pg_temp.cnt('contact_messages') || ' newsletter=' || pg_temp.cnt('newsletter_subscribers') || ' pending_reviews=' || pg_temp.cnt('reviews');
select 'anon sees products (expect 1 active, hidden one invisible) = ' || pg_temp.cnt('products');
select 'anon can read settings (public by design) = ' || pg_temp.cnt('settings');
do $$ begin begin insert into public.orders(order_number,channel,payment_method,subtotal_ngn,total_ngn) values ('X','online','paystack',1,1); raise notice 'FAIL anon inserted order'; exception when others then raise notice 'ok  anon insert order blocked (%)', sqlstate; end; end $$;
do $$ begin begin perform public.create_online_order('{}'::jsonb); raise notice 'FAIL anon ran create_online_order'; exception when others then raise notice 'ok  anon create_online_order blocked (%)', sqlstate; end; end $$;
do $$ begin begin perform public.mark_order_paid('x', 1); raise notice 'FAIL anon ran mark_order_paid'; exception when others then raise notice 'ok  anon mark_order_paid blocked (%)', sqlstate; end; end $$;
do $$ begin begin perform public.record_pos_sale('[]'::jsonb,'cash'); raise notice 'FAIL anon ran POS'; exception when others then raise notice 'ok  anon record_pos_sale blocked (%)', sqlstate; end; end $$;
do $$ begin begin update public.products set price_ngn=1; raise notice 'FAIL anon changed prices'; exception when insufficient_privilege then raise notice 'ok  anon cannot update products (permission denied)'; end; end $$;
reset role;
select 'products price still intact = ' || string_agg(price_ngn::text, ',') from public.products where sku='S1';

\echo ===== CUSTOMER c1 (logged in, aal1) =====
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal1');
set role authenticated;
select 'c1 sees orders: ' || coalesce(string_agg(order_number, ','),'none') from public.orders;
select 'c1 sees customers=' || pg_temp.cnt('customers') || ' stock_movements=' || pg_temp.cnt('stock_movements') || ' discounts=' || pg_temp.cnt('discounts') || ' audit=' || pg_temp.cnt('audit_log') || ' contact=' || pg_temp.cnt('contact_messages') || ' newsletter=' || pg_temp.cnt('newsletter_subscribers') || ' profiles(own only)=' || pg_temp.cnt('profiles');
do $$ begin begin insert into public.orders(order_number,channel,payment_method,subtotal_ngn,total_ngn,user_id) values ('FAKE','online','paystack',1,1,'00000000-0000-0000-0000-0000000000c1'); raise notice 'FAIL customer inserted an order'; exception when others then raise notice 'ok  customer cannot insert orders (%)', sqlstate; end; end $$;
do $$ begin begin update public.orders set total_ngn=1 where order_number='ONL-2026-9001'; raise notice 'FAIL customer edited an order total'; exception when insufficient_privilege then raise notice 'ok  customer cannot edit own order total (permission denied)'; end; end $$;
do $$ begin begin update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000c1'; raise notice 'update ran (checking result next)'; exception when others then raise notice 'ok  self-promotion blocked (%)', sqlstate; end; end $$;
select 'c1 role after self-promotion attempt = ' || role from public.profiles where id='00000000-0000-0000-0000-0000000000c1';
do $$ begin begin perform public.set_order_status((select id from public.orders limit 1),'delivered'); raise notice 'FAIL customer set status'; exception when others then raise notice 'ok  customer set_order_status blocked (%)', sqlstate; end; end $$;
do $$ begin begin perform public.adjust_stock((select id from public.products where sku='S1'),100,'x'); raise notice 'FAIL customer adjusted stock'; exception when others then raise notice 'ok  customer adjust_stock blocked (%)', sqlstate; end; end $$;
do $$ begin begin insert into public.reviews(product_id,user_id,name,rating,body,status) select id,'00000000-0000-0000-0000-0000000000c1','C1',5,'self published','published' from public.products where sku='S1'; raise notice 'FAIL customer self-published a review'; exception when others then raise notice 'ok  customer cannot self-publish review (%)', sqlstate; end; end $$;
do $$ begin begin update public.products set price_ngn=1 where sku='S1'; raise notice 'update ran (RLS: 0 rows expected)'; end; end $$;
reset role;
select 'price still ' || price_ngn from public.products where sku='S1';

\echo ===== STAFF without 2FA (stolen password, aal1) =====
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal1');
set role authenticated;
select 'staff aal1 sees orders=' || pg_temp.cnt('orders') || ' customers=' || pg_temp.cnt('customers');
do $$ begin begin perform public.adjust_stock((select id from public.products where sku='S1'),100,'x'); raise notice 'FAIL staff w/o 2FA changed stock'; exception when others then raise notice 'ok  staff w/o 2FA blocked from adjust_stock (%)', sqlstate; end; end $$;
reset role;

\echo ===== STAFF with 2FA (aal2) =====
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2');
set role authenticated;
select 'staff aal2 sees orders=' || pg_temp.cnt('orders') || ' customers=' || pg_temp.cnt('customers') || ' contact=' || pg_temp.cnt('contact_messages') || ' discounts(admin only)=' || pg_temp.cnt('discounts') || ' newsletter(admin only)=' || pg_temp.cnt('newsletter_subscribers') || ' audit(admin only)=' || pg_temp.cnt('audit_log');
do $$ begin begin update public.products set price_ngn=1 where sku='S1'; raise notice 'update ran (RLS expected to filter 0 rows for staff)'; end; end $$;
reset role;
select 'price after staff attempt = ' || price_ngn from public.products where sku='S1';

\echo ===== ADMIN with 2FA =====
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2');
set role authenticated;
select 'admin aal2 sees discounts=' || pg_temp.cnt('discounts') || ' audit=' || pg_temp.cnt('audit_log') || ' newsletter=' || pg_temp.cnt('newsletter_subscribers');
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal1');
set role authenticated;
select 'admin aal1 (no 2FA) sees discounts=' || pg_temp.cnt('discounts') || ' orders=' || pg_temp.cnt('orders');
reset role;
