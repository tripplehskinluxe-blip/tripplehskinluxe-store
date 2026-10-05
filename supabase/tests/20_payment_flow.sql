-- Payment flow checks. Every check prints "ok ..." or "FAIL ...".
\pset tuples_only on
create or replace function pg_temp.expect(label text, actual text, expected text) returns void language plpgsql as $$
begin if actual is not distinct from expected then raise notice 'ok  %', label; else raise notice 'FAIL % (got %, wanted %)', label, actual, expected; end if; end $$;
create or replace function pg_temp.rejects(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was accepted)', label; exception when others then raise notice 'ok  % (%)', label, sqlerrm; end; end $$;

insert into public.categories(name,slug) values ('Skincare','skincare');
insert into public.products (sku,slug,name,brand,category_id,price_ngn,stock) select 'S1','s1','Serum','B',id,10000,5 from public.categories;
create or replace function pg_temp.mk(ref text, qty int) returns text language sql as $$
 select public.create_online_order(jsonb_build_object('reference',ref,'name','Ada','email','a@x.co','phone','+2348012345678','address','{"state":"Lagos"}'::jsonb,
  'items', jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='S1'),'qty',qty)),
  'subtotal',10000*qty,'delivery',2000,'discount',0,'discount_code','','total',10000*qty+2000)) $$;

set role service_role;
select pg_temp.mk('ths_a', 2);
select pg_temp.rejects('unknown product rejected', $q$select public.create_online_order('{"items":[{"product_id":"00000000-0000-0000-0000-000000000000","qty":1}],"subtotal":1,"delivery":0,"discount":0,"total":1}'::jsonb)$q$);
select pg_temp.rejects('tampered cheap price rejected', $q$select public.create_online_order(jsonb_build_object('reference','ths_t','name','x','email','a@x.co','phone','0801','address','{}'::jsonb,'items',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='S1'),'qty',1)),'subtotal',1,'delivery',0,'discount',0,'total',1))$q$);
select pg_temp.expect('wrong amount is flagged, not paid', public.mark_order_paid('ths_a', 100), 'amount_mismatch');
select pg_temp.expect('right amount marks paid', public.mark_order_paid('ths_a', 2200000), 'paid');
select pg_temp.expect('duplicate webhook is harmless', public.mark_order_paid('ths_a', 2200000), 'already_paid');
select pg_temp.expect('stock taken exactly once (5-2)', (select stock::text from public.products where sku='S1'), '3');
select pg_temp.expect('unknown reference', public.mark_order_paid('ths_nope', 1), 'not_found');

-- cancelled, then a late payment arrives
select pg_temp.mk('ths_b', 1);
reset role;
update public.orders set status='cancelled' where paystack_reference='ths_b';
set role service_role;
select pg_temp.expect('late payment on cancelled order is kept + flagged', public.mark_order_paid('ths_b', 1200000), 'paid_cancelled');
reset role;
select pg_temp.expect('cancelled order stays cancelled', (select status from public.orders where paystack_reference='ths_b'), 'cancelled');
select pg_temp.expect('late payment recorded as paid', (select payment_status from public.orders where paystack_reference='ths_b'), 'paid');
select pg_temp.expect('late payment flagged for a human', (select needs_attention::text from public.orders where paystack_reference='ths_b'), 'true');
select pg_temp.expect('cancelled order takes no stock', (select stock::text from public.products where sku='S1'), '3');

-- oversell: stock 3, two orders of 2 both created while stock was enough
update public.products set stock=3 where sku='S1';
set role service_role;
select pg_temp.mk('ths_c', 2); select pg_temp.mk('ths_d', 2);
select pg_temp.expect('first of two competing orders wins', public.mark_order_paid('ths_c', 2200000), 'paid');
select pg_temp.expect('second is paid-but-flagged, stock never negative', public.mark_order_paid('ths_d', 2200000), 'paid_stock_issue');
reset role;
select pg_temp.expect('stock is 1, not -1', (select stock::text from public.products where sku='S1'), '1');
select pg_temp.expect('oversold order flagged', (select needs_attention::text from public.orders where paystack_reference='ths_d'), 'true');
