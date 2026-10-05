\pset tuples_only on
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','a@x'),('00000000-0000-0000-0000-0000000000b1','s@x'),('00000000-0000-0000-0000-0000000000c1','c@x');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='staff' where id='00000000-0000-0000-0000-0000000000b1';
insert into public.categories(name,slug) values ('Skincare','skincare');
insert into public.products (sku,slug,name,brand,category_id,price_ngn,stock) select 'S1','s1','Serum','B',id,10000,5 from public.categories;
create or replace function pg_temp.as_(uid text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',uid,'aal',aal)::text, false); end $$;
create or replace function pg_temp.mk(ref text, qty int, ph text) returns text language sql as $$
 select public.create_online_order(jsonb_build_object('reference',ref,'name','Ada','email','a@x.co','phone',ph,'address','{"state":"Lagos"}'::jsonb,
  'items', jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='S1'),'qty',qty)),
  'subtotal',10000*qty,'delivery',2000,'discount',0,'discount_code','','total',10000*qty+2000)) $$;

\echo --- phone normalising
select 'norm: ' || string_agg(public.norm_phone(x), ' | ') from unnest(array['+234 801 234 5678','2348012345678','8012345678','08012345678','0801-234-5678','+1 (415) 555-0100','']) x;
set role service_role;
select pg_temp.mk('ths_p1',1,'+2348012345678'); select pg_temp.mk('ths_p2',1,'08012345678');
reset role;
select 'same customer across formats -> customers=' || count(*) from public.customers;
\echo --- cancelled then paid
set role service_role;
select pg_temp.mk('ths_b',1,'08099999999');
reset role;
update public.orders set status='cancelled' where paystack_reference='ths_b';
set role service_role;
select 'late payment -> ' || public.mark_order_paid('ths_b', 1200000);
reset role;
select 'order: status=' || status || ' payment=' || payment_status || ' attention=' || needs_attention from public.orders where paystack_reference='ths_b';
select 'stock unchanged (expect 5) = ' || stock from public.products where sku='S1';
select 'audit row = ' || action from public.audit_log where action='paid_after_cancel';
\echo --- normal paid still works
set role service_role;
select public.mark_order_paid('ths_p1', 1200000) || ' / again: ' || public.mark_order_paid('ths_p1', 1200000);
reset role;
select 'stock (expect 4) = ' || stock from public.products where sku='S1';

\echo --- staff cannot advance an UNPAID paystack order; can advance a paid one
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2');
set role authenticated;
do $$ begin begin perform public.set_order_status((select id from public.orders where paystack_reference='ths_p2'),'shipped'); raise notice 'FAIL shipped an unpaid order'; exception when others then raise notice 'ok  unpaid order blocked: %', sqlerrm; end; end $$;
do $$ begin perform public.set_order_status((select id from public.orders where paystack_reference='ths_p1'),'shipped'); raise notice 'ok  paid order shipped'; end $$;
\echo --- set_stock_count
select 'set 4 -> 9 returns ' || public.set_stock_count((select id from public.products where sku='S1'), 9, 'count');
select 'delta logged: ' || delta || ' (' || note || ')' from public.stock_movements where reason='adjustment' order by id desc limit 1;
do $$ begin begin perform public.set_stock_count((select id from public.products where sku='S1'), -1, 'x'); raise notice 'FAIL negative'; exception when others then raise notice 'ok  negative count rejected: %', sqlerrm; end; end $$;
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal2');
set role authenticated;
do $$ begin begin perform public.set_stock_count((select id from public.products where sku='S1'), 999, 'x'); raise notice 'FAIL customer set stock'; exception when others then raise notice 'ok  customer set_stock_count blocked (%)', sqlstate; end; end $$;
do $$ begin begin perform public.claim_status_email((select id from public.orders limit 1)); raise notice 'FAIL customer ran claim_status_email'; exception when others then raise notice 'ok  customer claim_status_email blocked (%)', sqlstate; end; end $$;
reset role;

\echo --- email claim: sent once, released on failure
set role service_role;
select 'claim #1: ' || coalesce(public.claim_confirmation_email('ths_p1')::text,'null');
select 'claim #2 (must be null) : ' || coalesce(public.claim_confirmation_email('ths_p1')::text,'null');
select 'unpaid order claim (must be null): ' || coalesce(public.claim_confirmation_email('ths_p2')::text,'null');
select public.release_confirmation_email((select id from public.orders where paystack_reference='ths_p1'));
select 'after release, claim again: ' || coalesce(public.claim_confirmation_email('ths_p1')::text,'null');
select 'status claim shipped #1: ' || coalesce(public.claim_status_email((select id from public.orders where paystack_reference='ths_p1'))::text,'null');
select 'status claim shipped #2 (must be null): ' || coalesce(public.claim_status_email((select id from public.orders where paystack_reference='ths_p1'))::text,'null');
reset role;
update public.orders set status='delivered' where paystack_reference='ths_p1';
set role service_role;
select 'status claim delivered (new status -> sends): ' || coalesce(public.claim_status_email((select id from public.orders where paystack_reference='ths_p1'))::text,'null');
select 'status claim on cancelled (must be null): ' || coalesce(public.claim_status_email((select id from public.orders where paystack_reference='ths_b'))::text,'null');
reset role;

\echo --- legal pages RLS
set role anon;
select 'anon can read pages (none yet) = ' || count(*) from public.pages;
do $$ begin begin insert into public.pages(slug,title,body) values ('privacy','x','y'); raise notice 'FAIL anon wrote page'; exception when others then raise notice 'ok  anon cannot write pages (%)', sqlstate; end; end $$;
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal2'); set role authenticated;
do $$ begin begin insert into public.pages(slug,title,body) values ('privacy','x','y'); raise notice 'FAIL customer wrote page'; exception when others then raise notice 'ok  customer cannot write pages (%)', sqlstate; end; end $$;
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
do $$ begin begin insert into public.pages(slug,title,body) values ('privacy','x','y'); raise notice 'FAIL staff wrote page'; exception when others then raise notice 'ok  staff cannot write pages (%)', sqlstate; end; end $$;
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal1'); set role authenticated;
do $$ begin begin insert into public.pages(slug,title,body) values ('privacy','x','y'); raise notice 'FAIL admin w/o 2FA wrote page'; exception when others then raise notice 'ok  admin without 2FA cannot write pages (%)', sqlstate; end; end $$;
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
insert into public.pages(slug,title,body) values ('privacy','Privacy Policy','Hello');
do $$ begin begin insert into public.pages(slug,title,body) values ('hack','x','y'); raise notice 'FAIL bad slug'; exception when others then raise notice 'ok  unknown page slug rejected (%)', sqlstate; end; end $$;
update public.pages set body='Edited' where slug='privacy';
reset role;
select 'admin(2FA) wrote page; updated_by set = ' || (updated_by = '00000000-0000-0000-0000-0000000000a1')::text from public.pages;
set role anon; select 'anon reads page: ' || title || ' / ' || body from public.pages; reset role;
