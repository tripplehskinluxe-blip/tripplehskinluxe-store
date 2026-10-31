-- Cancelling, putting stock back, and refunding exactly once. Every check prints "ok ..." or "FAIL ...".
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
create or replace function pg_temp.oid(ref text) returns uuid language sql as $$ select id from public.orders where paystack_reference = ref $$;
create or replace function pg_temp.mk(ref text, method text default 'delivery', delivery int default 2000) returns text language sql as $$
  select public.create_online_order(jsonb_build_object('reference',ref,'name','Ada','email','a@x.co','phone','08012345678',
    'address', case when method = 'pickup' then '{"pickup":true,"address":"Shop, Yaba"}'::jsonb else '{"state":"Lagos","city":"Yaba","address":"1 Road"}'::jsonb end,
    'items', jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='S1'),'qty',1)),
    'subtotal',10000,'delivery',case when method='pickup' then 0 else delivery end,'discount',0,'discount_code','','total',10000 + case when method='pickup' then 0 else delivery end,'delivery_method',method)) $$;
create or replace function pg_temp.pay(ref text) returns text language sql as $$ select public.mark_order_paid(ref, (select total_ngn::bigint * 100 from public.orders where paystack_reference = ref)) $$;
create or replace function pg_temp.stock() returns text language sql as $$ select stock::text from public.products where sku='S1' $$;

insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','boss@shop.com'),('00000000-0000-0000-0000-0000000000b1','till@shop.com'),('00000000-0000-0000-0000-0000000000c1','buyer@x.com');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='staff' where id='00000000-0000-0000-0000-0000000000b1';
insert into public.categories(name,slug) values ('Skincare','skincare');
insert into public.products (sku,slug,name,brand,price_ngn,stock) values ('S1','s1','Serum','B',10000,50);

\echo --- STAFF CANCEL: stock back, one refund ticket
select pg_temp.mk('ths_a1'); select pg_temp.pay('ths_a1');
select pg_temp.expect('paying takes the stock', pg_temp.stock(), '49');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select public.set_order_status(pg_temp.oid('ths_a1'), 'cancelled');
reset role;
select pg_temp.expect('cancelling puts the stock back', pg_temp.stock(), '50');
select pg_temp.expect('the order is cancelled by staff', pg_temp.col('ths_a1','status') || ' / ' || pg_temp.col('ths_a1','cancelled_by'), 'cancelled / staff');
select pg_temp.expect('a paid order gets one refund ticket for the full total', (select amount_ngn::text || '/' || status from public.order_refunds where order_id = pg_temp.oid('ths_a1')), '12000/requested');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select public.set_order_status(pg_temp.oid('ths_a1'), 'cancelled');
reset role;
select pg_temp.expect('cancelling twice does not put the stock back twice', pg_temp.stock(), '50');
select pg_temp.expect('...and never creates a second refund ticket', (select count(*)::text from public.order_refunds where order_id = pg_temp.oid('ths_a1')), '1');
select pg_temp.rejects('the table itself refuses a second ticket for the same order', format($q$insert into public.order_refunds (order_id, amount_ngn) values (%L, 5)$q$, pg_temp.oid('ths_a1')));
select pg_temp.mk('ths_u1');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select public.set_order_status(pg_temp.oid('ths_u1'), 'cancelled');
reset role;
select pg_temp.expect('cancelling an UNPAID order changes no stock', pg_temp.stock(), '50');
select pg_temp.expect('...and creates no refund ticket', (select count(*)::text from public.order_refunds where order_id = pg_temp.oid('ths_u1')), '0');
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal2'); set role authenticated;
select pg_temp.rejects('a customer cannot use the staff cancel', format($q$select public.set_order_status(%L, 'cancelled')$q$, pg_temp.oid('ths_a1')));
reset role;

\echo --- CUSTOMER CANCEL
select pg_temp.mk('ths_c1'); select pg_temp.pay('ths_c1');
select pg_temp.expect('stock is taken for the paid order', pg_temp.stock(), '49');
select pg_temp.expect('the wrong phone looks exactly like "no such order"', public.customer_cancel_order((select order_number from public.orders where paystack_reference='ths_c1'), '08099999999') ->> 'code', 'not_found');
select pg_temp.expect('an unknown order number looks the same', public.customer_cancel_order('ONL-2099-999', '08012345678') ->> 'code', 'not_found');
select pg_temp.expect('...and the order is untouched', pg_temp.col('ths_c1','status'), 'processing');
select pg_temp.expect('the right phone, written differently, cancels it', public.customer_cancel_order((select order_number from public.orders where paystack_reference='ths_c1'), '0801 234 5678', 'changed my mind') ->> 'code', 'ok');
select pg_temp.expect('the order shows who cancelled and why', pg_temp.col('ths_c1','cancelled_by') || ' / ' || pg_temp.col('ths_c1','cancel_reason'), 'customer / changed my mind');
select pg_temp.expect('the stock is back', pg_temp.stock(), '50');
select pg_temp.expect('a paid customer cancel creates the refund ticket', (select status from public.order_refunds where order_id = pg_temp.oid('ths_c1')), 'requested');
select pg_temp.expect('cancelling again is harmless ("already")', (public.customer_cancel_order((select order_number from public.orders where paystack_reference='ths_c1'), '08012345678') ->> 'already'), 'true');
select pg_temp.expect('...and the stock does not move again', pg_temp.stock(), '50');

select pg_temp.mk('ths_c2'); select pg_temp.pay('ths_c2');
update public.orders set status = 'shipped' where paystack_reference = 'ths_c2';
select pg_temp.expect('a SHIPPED order cannot be cancelled by the customer', public.customer_cancel_order((select order_number from public.orders where paystack_reference='ths_c2'), '08012345678') ->> 'code', 'not_cancellable');
update public.orders set status = 'packed' where paystack_reference = 'ths_c2';
select pg_temp.expect('a packed order still can', public.customer_cancel_order((select order_number from public.orders where paystack_reference='ths_c2'), '08012345678') ->> 'code', 'ok');
select pg_temp.mk('ths_c3'); select pg_temp.pay('ths_c3');
update public.orders set status = 'delivered' where paystack_reference = 'ths_c3';
select pg_temp.expect('a delivered order cannot be cancelled', public.customer_cancel_order((select order_number from public.orders where paystack_reference='ths_c3'), '08012345678') ->> 'code', 'not_cancellable');
select pg_temp.mk('ths_c4','pickup'); select pg_temp.pay('ths_c4');
update public.orders set status = 'ready_for_pickup', pickup_code = 'ABC123' where paystack_reference = 'ths_c4';
select pg_temp.expect('a pickup order that is READY cannot be cancelled online', public.customer_cancel_order((select order_number from public.orders where paystack_reference='ths_c4'), '08012345678') ->> 'code', 'not_cancellable');
update public.orders set status = 'processing' where paystack_reference = 'ths_c4';
select pg_temp.expect('a pickup order still being prepared can', public.customer_cancel_order((select order_number from public.orders where paystack_reference='ths_c4'), '08012345678') ->> 'code', 'ok');
select pg_temp.mk('ths_c5');
select pg_temp.expect('an unpaid order can be cancelled by its customer', public.customer_cancel_order((select order_number from public.orders where paystack_reference='ths_c5'), '08012345678') ->> 'code', 'ok');
select pg_temp.expect('...with no refund ticket and no stock change', (select count(*)::text from public.order_refunds where order_id = pg_temp.oid('ths_c5')) || ' / ' || pg_temp.stock(), '0 / 49');

\echo --- THE REFUND, STEP BY STEP
select pg_temp.expect('a cancelled paid order can be claimed for refunding', (public.refund_claim(pg_temp.oid('ths_a1')) ->> 'claimed'), 'true');
select pg_temp.expect('the claim carries the exact amount in kobo', (select (public.refund_claim(pg_temp.oid('ths_a1')) ->> 'reason')), 'already');
select pg_temp.expect('a second claim while one is in flight is refused', (select status from public.order_refunds where order_id = pg_temp.oid('ths_a1')), 'processing');
select public.refund_result(pg_temp.oid('ths_a1'), true, '777');
select pg_temp.expect('Paystack accepting it marks the order refunded', pg_temp.col('ths_a1','payment_status') || ' / ' || pg_temp.col('ths_a1','needs_attention'), 'refunded / false');
select pg_temp.expect('...and a later claim finds nothing left to refund', (public.refund_claim(pg_temp.oid('ths_a1')) ->> 'reason'), 'not_refundable');
select pg_temp.expect('a stray second report is ignored', (select status from (select public.refund_result(pg_temp.oid('ths_a1'), false, null, 'late error') as x) s, public.order_refunds where order_id = pg_temp.oid('ths_a1')), 'accepted');
select pg_temp.expect('an order that is not cancelled cannot be claimed', (public.refund_claim(pg_temp.oid('ths_d1') ) ->> 'reason'), 'not_found');
select pg_temp.mk('ths_n1'); select pg_temp.pay('ths_n1');
select pg_temp.expect('a paid order that is NOT cancelled cannot be claimed', (public.refund_claim(pg_temp.oid('ths_n1')) ->> 'reason'), 'not_refundable');
select pg_temp.expect('an unpaid cancelled order cannot be claimed', (public.refund_claim(pg_temp.oid('ths_c5')) ->> 'reason'), 'not_refundable');

\echo --- WHEN PAYSTACK SAYS NO
select pg_temp.expect('the customer-cancelled order is claimed', (public.refund_claim(pg_temp.oid('ths_c1')) ->> 'claimed'), 'true');
select public.refund_result(pg_temp.oid('ths_c1'), false, null, 'Insufficient balance');
select pg_temp.expect('a failed attempt is recorded and flagged for a person', (select status || ' / ' || error from public.order_refunds where order_id = pg_temp.oid('ths_c1')) || ' / ' || pg_temp.col('ths_c1','needs_attention') || ' / ' || pg_temp.col('ths_c1','payment_status'), 'failed / Insufficient balance / true / paid');
select pg_temp.expect('it can be tried again', (public.refund_claim(pg_temp.oid('ths_c1')) ->> 'claimed'), 'true');
select public.refund_result(pg_temp.oid('ths_c1'), false, null, 'timeout');
update public.order_refunds set attempts = 5 where order_id = pg_temp.oid('ths_c1');
select pg_temp.expect('after 5 attempts the automatic retries stop', (public.refund_claim(pg_temp.oid('ths_c1')) ->> 'claimed'), 'false');
select pg_temp.expect('...but a person can still retry by hand', (public.refund_claim(pg_temp.oid('ths_c1'), true) ->> 'claimed'), 'true');
select public.refund_result(pg_temp.oid('ths_c1'), true, '888');
select pg_temp.expect('and then it is refunded', pg_temp.col('ths_c1','payment_status'), 'refunded');

\echo --- PAYSTACK NEWS (webhook events)
select public.refund_event('ths_c1', 'processed');
select pg_temp.expect('processed is final', (select status from public.order_refunds where order_id = pg_temp.oid('ths_c1')), 'processed');
select public.refund_event('ths_c1', 'failed');
select pg_temp.expect('a processed refund is never undone by a later "failed"', pg_temp.col('ths_c1','payment_status'), 'refunded');
select pg_temp.mk('ths_e1'); select pg_temp.pay('ths_e1');
select public.customer_cancel_order((select order_number from public.orders where paystack_reference='ths_e1'), '08012345678');
select public.refund_claim(pg_temp.oid('ths_e1')); select public.refund_result(pg_temp.oid('ths_e1'), true, '901');
select public.refund_event('ths_e1', 'failed');
select pg_temp.expect('Paystack later failing the refund puts the order back for a person', pg_temp.col('ths_e1','payment_status') || ' / ' || pg_temp.col('ths_e1','needs_attention'), 'paid / true');
select pg_temp.expect('...and the ticket can be tried again', (public.refund_claim(pg_temp.oid('ths_e1')) ->> 'claimed'), 'true');
select pg_temp.mk('ths_e2'); select pg_temp.pay('ths_e2');
select public.customer_cancel_order((select order_number from public.orders where paystack_reference='ths_e2'), '08012345678');
select public.refund_event('ths_e2', 'processing');
select pg_temp.expect('a refund done by hand in the Paystack dashboard is recognised', pg_temp.col('ths_e2','payment_status') || ' / ' || (select status from public.order_refunds where order_id = pg_temp.oid('ths_e2')), 'refunded / accepted');
select public.refund_event('ths_n1', 'processed');
select pg_temp.expect('a refund event for an order that is NOT cancelled changes nothing', pg_temp.col('ths_n1','payment_status'), 'paid');
select public.refund_event('ths_nobody', 'processed');
select pg_temp.expect('an unknown reference is ignored', 'ok', 'ok');
select public.refund_event('ths_e2', 'something-new');
select pg_temp.expect('an unknown state is ignored', pg_temp.col('ths_e2','payment_status'), 'refunded');

\echo --- EMAILS: claimed once
select pg_temp.expect('the cancel email is claimed once', public.claim_order_email(pg_temp.oid('ths_a1'), 'cancelled')::text, 'true');
select pg_temp.expect('...never twice', public.claim_order_email(pg_temp.oid('ths_a1'), 'cancelled')::text, 'false');
select public.release_order_email(pg_temp.oid('ths_a1'), 'cancelled');
select pg_temp.expect('...unless sending failed and it was released', public.claim_order_email(pg_temp.oid('ths_a1'), 'cancelled')::text, 'true');
select pg_temp.rejects('only known email kinds exist', format($q$select public.claim_order_email(%L, 'spam')$q$, pg_temp.oid('ths_a1')));

\echo --- WHO CAN DO WHAT
create temp table ids as select substr(paystack_reference, 5) k, id from public.orders where paystack_reference like 'ths_%'; grant select on ids to public;
set role anon;
select pg_temp.denied('a visitor cannot cancel through the database', $q$select public.customer_cancel_order('ONL-2026-1','1')$q$);
select pg_temp.denied('a visitor cannot ask for a refund', format($q$select public.refund_claim(%L)$q$, (select id from ids where k='a1')));
select pg_temp.denied('a visitor cannot read refunds', $q$select * from public.order_refunds$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal1'); set role authenticated;
select pg_temp.denied('a customer cannot cancel through the database', $q$select public.customer_cancel_order('ONL-2026-1','1')$q$);
select pg_temp.denied('a customer cannot ask for a refund', format($q$select public.refund_claim(%L)$q$, (select id from ids where k='a1')));
select pg_temp.denied('a customer cannot report a refund result', format($q$select public.refund_result(%L, true)$q$, (select id from ids where k='a1')));
select pg_temp.denied('a customer cannot fake Paystack news', $q$select public.refund_event('ths_a1','processed')$q$);
select pg_temp.denied('nobody signed in can call cancel_order directly (only set_order_status reaches it)', format($q$select public.cancel_order(%L)$q$, (select id from ids where k='a1')));
select pg_temp.denied('a customer cannot call the internal cancel', format($q$select public._cancel_core(%L,'staff',null,null)$q$, (select id from ids where k='a1')));
select pg_temp.denied('a customer cannot cancel as someone else', format($q$select public.cancel_order_for('00000000-0000-0000-0000-0000000000a1', %L)$q$, (select id from ids where k='n1')));
select pg_temp.expect('a customer sees no refunds', (select count(*)::text from public.order_refunds), '0');
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.expect('staff can read refunds', (select (count(*) > 0)::text from public.order_refunds), 'true');
select pg_temp.denied('staff cannot write refunds directly', $q$update public.order_refunds set status = 'processed'$q$);
select pg_temp.denied('staff cannot read the email log', $q$select * from public.order_emails$q$);
select pg_temp.denied('staff cannot ask Paystack for a refund through the database', format($q$select public.refund_claim(%L)$q$, (select id from ids where k='a1')));
reset role;
select pg_temp.expect('the server key CAN cancel on behalf of a team member', (public.cancel_order_for('00000000-0000-0000-0000-0000000000b1', (select id from ids where k='n1')) ->> 'paid'), 'true');
select pg_temp.rejects('...but not on behalf of a customer', format($q$select public.cancel_order_for('00000000-0000-0000-0000-0000000000c1', %L)$q$, (select id from ids where k='u1')));
