-- Store pickup: free, paid online first, ready / not ready, pickup code, flags. Every check prints "ok ..." or "FAIL ...".
\pset tuples_only on
create or replace function pg_temp.expect(label text, actual text, expected text) returns void language plpgsql as $$
begin if actual is not distinct from expected then raise notice 'ok  %', label; else raise notice 'FAIL % (got %, wanted %)', label, actual, expected; end if; end $$;
create or replace function pg_temp.as_(uid text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',uid,'aal',aal)::text, false); end $$;
create or replace function pg_temp.rejects(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was accepted)', label; exception when others then raise notice 'ok  % (%)', label, sqlerrm; end; end $$;
create or replace function pg_temp.denied(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was allowed)', label; exception when insufficient_privilege then raise notice 'ok  % (permission denied)', label; when others then raise notice 'FAIL % (wrong error: %)', label, sqlerrm; end; end $$;
create or replace function pg_temp.col(ref text, c text) returns text language plpgsql as $$ declare r text; begin execute format('select %I::text from public.orders where paystack_reference = %L', c, ref) into r; return r; end $$;
create or replace function pg_temp.mk(ref text, method text, delivery int, extra jsonb default '{}') returns text language sql as $$
  select public.create_online_order(jsonb_build_object('reference',ref,'name','Ada','email','a@x.co','phone','08012345678',
    'address', case when method = 'pickup' then '{"pickup":true,"address":"Shop, Yaba"}'::jsonb else '{"state":"Lagos","city":"Yaba","address":"1 Road"}'::jsonb end,
    'items', jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='S1'),'qty',1)),
    'subtotal',10000,'delivery',delivery,'discount',0,'discount_code','','total',10000+delivery,'delivery_method',method) || extra) $$;
create or replace function pg_temp.pay(ref text) returns text language sql as $$ select public.mark_order_paid(ref, (select total_ngn::bigint * 100 from public.orders where paystack_reference = ref)) $$;

insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','boss@shop.com'),('00000000-0000-0000-0000-0000000000b1','till@shop.com'),('00000000-0000-0000-0000-0000000000c1','buyer@x.com');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='staff' where id='00000000-0000-0000-0000-0000000000b1';
insert into public.categories(name,slug) values ('Skincare','skincare');
insert into public.products (sku,slug,name,brand,price_ngn,stock) values ('S1','s1','Serum','B',10000,20);

\echo --- CREATING ORDERS
select pg_temp.mk('ths_d1','delivery',2000);
select pg_temp.expect('a delivery order is stored as delivery', pg_temp.col('ths_d1','delivery_method'), 'delivery');
insert into public.orders (order_number, channel, payment_method, subtotal_ngn, total_ngn) values ('ONL-OLD-1','online','paystack',100,100);
select pg_temp.expect('an order that does not say how it leaves defaults to delivery', (select delivery_method from public.orders where order_number='ONL-OLD-1'), 'delivery');
select pg_temp.mk('ths_p1','pickup',0);
select pg_temp.expect('a pickup order is stored as pickup', pg_temp.col('ths_p1','delivery_method'), 'pickup');
select pg_temp.expect('a pickup order has no delivery fee', pg_temp.col('ths_p1','delivery_ngn'), '0');
select pg_temp.rejects('pickup with a delivery fee is refused', $q$select pg_temp.mk('ths_p2','pickup',2000)$q$);
select pg_temp.rejects('an unknown delivery method is refused', $q$select pg_temp.mk('ths_x1','courier',2000)$q$);
select pg_temp.rejects('the table itself refuses a fee on a pickup order', $q$update public.orders set delivery_ngn = 500 where paystack_reference = 'ths_p1'$q$);
select pg_temp.rejects('a pickup code cannot sit on a delivery order', $q$update public.orders set pickup_code = 'ABC123' where paystack_reference = 'ths_d1'$q$);

\echo --- READY / NOT READY
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.rejects('an UNPAID pickup order cannot be marked ready', $q$select public.set_order_status((select id from public.orders where paystack_reference='ths_p1'),'ready_for_pickup')$q$);
reset role;
select pg_temp.expect('paying a pickup order starts it as processing', (select pg_temp.pay('ths_p1') || ' / ' || pg_temp.col('ths_p1','status')), 'paid / processing');
select pg_temp.expect('no pickup code before it is ready', coalesce(pg_temp.col('ths_p1','pickup_code'),'none'), 'none');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select public.set_order_status((select id from public.orders where paystack_reference='ths_p1'),'ready_for_pickup');
reset role;
select pg_temp.expect('staff can mark a paid pickup order ready', pg_temp.col('ths_p1','status'), 'ready_for_pickup');
select pg_temp.expect('a 6-character pickup code is issued', (select (pickup_code ~ '^[0-9A-F]{6}$')::text from public.orders where paystack_reference='ths_p1'), 'true');
create temp table keep as select pickup_code c from public.orders where paystack_reference='ths_p1';
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select public.set_order_status((select id from public.orders where paystack_reference='ths_p1'),'processing');
reset role;
select pg_temp.expect('NOT ready puts it back to processing', pg_temp.col('ths_p1','status'), 'processing');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select public.set_order_status((select id from public.orders where paystack_reference='ths_p1'),'ready_for_pickup');
reset role;
select pg_temp.expect('toggling back to ready keeps the SAME pickup code', (select (pickup_code = (select c from keep))::text from public.orders where paystack_reference='ths_p1'), 'true');

\echo --- STEPS THAT MAKE NO SENSE ARE REFUSED
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.rejects('a pickup order cannot be packed', $q$select public.set_order_status((select id from public.orders where paystack_reference='ths_p1'),'packed')$q$);
select pg_temp.rejects('a pickup order cannot be shipped', $q$select public.set_order_status((select id from public.orders where paystack_reference='ths_p1'),'shipped')$q$);
select pg_temp.rejects('a pickup order cannot go out for delivery', $q$select public.set_order_status((select id from public.orders where paystack_reference='ths_p1'),'out_for_delivery')$q$);
select pg_temp.rejects('a delivery order cannot be marked ready for pickup', $q$select public.set_order_status((select id from public.orders where paystack_reference='ths_d1'),'ready_for_pickup')$q$);
reset role;
select pg_temp.mk('ths_p3','pickup',0); select pg_temp.pay('ths_p3');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.rejects('collected is refused before the order was marked ready', $q$select public.set_order_status((select id from public.orders where paystack_reference='ths_p3'),'delivered')$q$);
select public.set_order_status((select id from public.orders where paystack_reference='ths_p1'),'delivered');
reset role;
select pg_temp.expect('collected works after ready', pg_temp.col('ths_p1','status'), 'delivered');

\echo --- WHO CAN DO WHAT
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal1'); set role authenticated;
select pg_temp.rejects('a customer cannot change an order status', $q$select public.set_order_status((select id from public.orders where paystack_reference='ths_p3'),'ready_for_pickup')$q$);
reset role; set role anon;
select pg_temp.denied('a visitor cannot read orders (so never a pickup code)', $q$select pickup_code from public.orders$q$);
select pg_temp.denied('a visitor cannot create orders directly', $q$select public.create_online_order('{}'::jsonb)$q$);
reset role;

\echo --- EMAILS (once per status, no spam when toggling)
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select public.set_order_status((select id from public.orders where paystack_reference='ths_p3'),'ready_for_pickup');
reset role;
select pg_temp.expect('the ready email is claimed once', (select (public.claim_status_email((select id from public.orders where paystack_reference='ths_p3')) ->> 'status')), 'ready_for_pickup');
select pg_temp.expect('...and not a second time', coalesce((select public.claim_status_email((select id from public.orders where paystack_reference='ths_p3'))::text), 'none'), 'none');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select public.set_order_status((select id from public.orders where paystack_reference='ths_p3'),'processing');
select public.set_order_status((select id from public.orders where paystack_reference='ths_p3'),'ready_for_pickup');
reset role;
select pg_temp.expect('flipping ready / not ready does not email the customer again', coalesce((select public.claim_status_email((select id from public.orders where paystack_reference='ths_p3'))::text), 'none'), 'none');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select public.set_order_status((select id from public.orders where paystack_reference='ths_p3'),'delivered');
reset role;
select pg_temp.expect('collected sends its own email', (select (public.claim_status_email((select id from public.orders where paystack_reference='ths_p3')) ->> 'status')), 'delivered');

\echo --- FLAGS FOR STAFF
select pg_temp.mk('ths_f1','delivery',2000, '{"attention_reason":"City Kano is in Kano state, not Lagos"}'::jsonb);
select pg_temp.expect('a flagged order keeps the reason', pg_temp.col('ths_f1','attention_reason'), 'City Kano is in Kano state, not Lagos');
select pg_temp.expect('...but is not "needs attention" while it is unpaid', pg_temp.col('ths_f1','needs_attention'), 'false');
select pg_temp.pay('ths_f1');
select pg_temp.expect('...it becomes "needs attention" once paid', pg_temp.col('ths_f1','needs_attention'), 'true');
select pg_temp.mk('ths_f2','delivery',2000, jsonb_build_object('attention_reason', repeat('x', 500)));
select pg_temp.expect('a very long reason is cut to 200 characters', (select length(attention_reason)::text from public.orders where paystack_reference='ths_f2'), '200');

\echo --- CANCELLING A PAID PICKUP ORDER
select pg_temp.mk('ths_c1','pickup',0); select pg_temp.pay('ths_c1');
select pg_temp.expect('stock is taken when a pickup order is paid', (select stock::text from public.products where sku='S1'), '16');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select public.set_order_status((select id from public.orders where paystack_reference='ths_c1'),'cancelled');
reset role;
select pg_temp.expect('cancelling puts the stock back', (select stock::text from public.products where sku='S1'), '17');
select pg_temp.expect('a cancelled paid order is flagged: refund due', pg_temp.col('ths_c1','needs_attention') || ' / ' || pg_temp.col('ths_c1','payment_status'), 'true / paid');
