-- Refund approval: nothing moves without a person with the permission; who may approve; what approve and decline do. Prints "ok ..." or "FAIL ...";
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
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000b2','shelf@shop.com'),('00000000-0000-0000-0000-0000000000b3','floor@shop.com');
update public.profiles set role='staff' where id in ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b3');
create or replace function pg_temp.ons(ref text) returns text language sql as $$ select order_number from public.orders where paystack_reference = ref $$;
create or replace function pg_temp.rf(ref text, c text) returns text language plpgsql as $$ declare r text; begin execute format('select %I::text from public.order_refunds where order_id = %L', c, pg_temp.oid(ref)) into r; return r; end $$;
create or replace function pg_temp.cust_cancel(ref text) returns text language sql as $$ select public.customer_cancel_order(pg_temp.ons(ref), '08012345678') ->> 'code' $$;

\echo --- A CUSTOMER CANCELS A PAID ORDER: NOTHING MOVES
select pg_temp.mk('ths_r1'); select pg_temp.pay('ths_r1');
select pg_temp.expect('paying takes the stock', pg_temp.stock(), '49');
select pg_temp.expect('the customer can cancel', pg_temp.cust_cancel('ths_r1'), 'ok');
select pg_temp.expect('the order is cancelled and flagged for a person', pg_temp.col('ths_r1','status') || '/' || pg_temp.col('ths_r1','needs_attention'), 'cancelled/true');
select pg_temp.expect('the refund waits for approval', pg_temp.rf('ths_r1','status'), 'awaiting_approval');
select pg_temp.expect('the stock stays reserved (the goods may already be with the customer)', pg_temp.stock(), '49');
select pg_temp.expect('the state to return to is remembered', pg_temp.col('ths_r1','cancel_prev_status'), 'processing');
select pg_temp.expect('even a forced, manual claim cannot start the refund', (public.refund_claim(pg_temp.oid('ths_r1'), true) ->> 'claimed') || '/' || (public.refund_claim(pg_temp.oid('ths_r1'), true) ->> 'status'), 'false/awaiting_approval');
select pg_temp.expect('...and nothing is marked refunded', pg_temp.col('ths_r1','payment_status'), 'paid');
select pg_temp.mk('ths_u1');
select pg_temp.expect('an UNPAID order is still cancelled at once', pg_temp.cust_cancel('ths_u1'), 'ok');
select pg_temp.expect('...with no refund ticket and the stock back', (select count(*)::text from public.order_refunds where order_id = pg_temp.oid('ths_u1')) || '/' || pg_temp.stock(), '0/49');

\echo --- WHO MAY APPROVE
set role anon;
select pg_temp.denied('a visitor cannot approve', $q$select public.approve_refund('00000000-0000-0000-0000-000000000001')$q$);
select pg_temp.denied('...nor ask whether they may', $q$select public.can_approve_refunds()$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal2'); set role authenticated;
select pg_temp.rejects('a customer account cannot approve', format($q$select public.approve_refund(%L)$q$, pg_temp.oid('ths_r1')));
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b3','aal2'); set role authenticated;
select pg_temp.expect('staff WITHOUT the permission: can_approve_refunds is false', public.can_approve_refunds()::text, 'false');
select pg_temp.rejects('...and cannot approve', format($q$select public.approve_refund(%L)$q$, pg_temp.oid('ths_r1')));
select pg_temp.rejects('...nor decline', format($q$select public.decline_refund(%L, 'no')$q$, pg_temp.oid('ths_r1')));
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal1'); set role authenticated;
select pg_temp.rejects('an admin WITHOUT two-factor cannot approve', format($q$select public.approve_refund(%L)$q$, pg_temp.oid('ths_r1')));
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select public.team_set_refunds('00000000-0000-0000-0000-0000000000b2', true);
select pg_temp.expect('the admin can authorise a staff member', (select can_approve_refunds::text from public.team_list() where id = '00000000-0000-0000-0000-0000000000b2'), 'true');
select pg_temp.expect('...and others stay off', (select can_approve_refunds::text from public.team_list() where id = '00000000-0000-0000-0000-0000000000b3'), 'false');
reset role;
select pg_temp.expect('the switch is audit-logged', (select count(*)::text from public.audit_log where action = 'team_set_refunds'), '1');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b2','aal1'); set role authenticated;
select pg_temp.expect('an authorised staff member WITHOUT two-factor gets nothing', public.can_approve_refunds()::text, 'false');
reset role;

\echo --- APPROVING
select pg_temp.as_('00000000-0000-0000-0000-0000000000b2','aal2'); set role authenticated;
select pg_temp.expect('an authorised staff member can approve', public.approve_refund(pg_temp.oid('ths_r1')) ->> 'code', 'ok');
select pg_temp.expect('approving twice does nothing', public.approve_refund(pg_temp.oid('ths_r1')) ->> 'code', 'not_awaiting');
reset role;
select pg_temp.expect('the refund is now approved, with who and when', pg_temp.rf('ths_r1','status') || '/' || (pg_temp.rf('ths_r1','decided_by') = '00000000-0000-0000-0000-0000000000b2')::text || '/' || (pg_temp.rf('ths_r1','decided_at') is not null)::text, 'requested/true/true');
select pg_temp.expect('the stock goes back now, once', pg_temp.stock(), '50');
select pg_temp.expect('the approval is audit-logged', (select count(*)::text from public.audit_log where action = 'refund_approved'), '1');
select pg_temp.expect('only now can Paystack be asked', public.refund_claim(pg_temp.oid('ths_r1')) ->> 'claimed', 'true');
select public.refund_result(pg_temp.oid('ths_r1'), true, '501');
select pg_temp.expect('...and the order ends refunded', pg_temp.col('ths_r1','payment_status'), 'refunded');

\echo --- DECLINING A CUSTOMER'S CANCELLATION PUTS THE ORDER BACK
select pg_temp.mk('ths_r2'); select pg_temp.pay('ths_r2');
update public.orders set status = 'packed' where paystack_reference = 'ths_r2';
select pg_temp.stock() as before_r2 \gset
select pg_temp.expect('the customer cancels a packed, paid order', pg_temp.cust_cancel('ths_r2'), 'ok');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b2','aal2'); set role authenticated;
select pg_temp.expect('an authorised staff member declines', public.decline_refund(pg_temp.oid('ths_r2'), 'already dispatched') ->> 'reinstated', 'true');
reset role;
select pg_temp.expect('the order is back where it was', pg_temp.col('ths_r2','status') || '/' || coalesce(pg_temp.col('ths_r2','cancelled_by'), 'none') || '/' || pg_temp.col('ths_r2','needs_attention'), 'packed/none/false');
select pg_temp.expect('the stock never moved', pg_temp.stock(), :'before_r2');
select pg_temp.expect('the refund is declined, with the note', pg_temp.rf('ths_r2','status') || '/' || pg_temp.rf('ths_r2','decision_note'), 'declined/already dispatched');
select pg_temp.expect('a declined refund can never be claimed (the order is no longer cancelled)', (public.refund_claim(pg_temp.oid('ths_r2'), true) ->> 'claimed') || '/' || (public.refund_claim(pg_temp.oid('ths_r2'), true) ->> 'reason'), 'false/not_refundable');
select pg_temp.expect('the decline is audit-logged', (select count(*)::text from public.audit_log where action = 'refund_declined'), '1');
select pg_temp.expect('if the customer cancels AGAIN, the refund is re-opened for approval (one ticket only)', pg_temp.cust_cancel('ths_r2') || '/' || pg_temp.rf('ths_r2','status') || '/' || (select count(*)::text from public.order_refunds where order_id = pg_temp.oid('ths_r2')), 'ok/awaiting_approval/1');

\echo --- STAFF CANCELLATIONS: cancelled at once, money still waits
select pg_temp.mk('ths_r3'); select pg_temp.pay('ths_r3');
select pg_temp.stock() as before_r3 \gset
select pg_temp.as_('00000000-0000-0000-0000-0000000000b2','aal2'); set role authenticated;
select public.set_order_status(pg_temp.oid('ths_r3'), 'cancelled');
reset role;
select pg_temp.expect('a staff cancel puts the stock back at once', pg_temp.stock(), (:'before_r3'::int + 1)::text);
select pg_temp.expect('...and the refund waits, remembering who cancelled', pg_temp.rf('ths_r3','status') || '/' || (pg_temp.rf('ths_r3','requested_by_user') = '00000000-0000-0000-0000-0000000000b2')::text, 'awaiting_approval/true');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b2','aal2'); set role authenticated;
select pg_temp.rejects('a staff approver cannot approve the cancellation THEY made', format($q$select public.approve_refund(%L)$q$, pg_temp.oid('ths_r3')));
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select pg_temp.expect('an admin can approve it', public.approve_refund(pg_temp.oid('ths_r3')) ->> 'code', 'ok');
reset role;
select pg_temp.mk('ths_r4'); select pg_temp.pay('ths_r4');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b3','aal2'); set role authenticated;
select public.set_order_status(pg_temp.oid('ths_r4'), 'cancelled');
reset role;
select pg_temp.expect('staff WITHOUT the permission can still cancel; the refund waits', pg_temp.col('ths_r4','status') || '/' || pg_temp.rf('ths_r4','status'), 'cancelled/awaiting_approval');
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select pg_temp.expect('declining a STAFF cancellation keeps the order cancelled', public.decline_refund(pg_temp.oid('ths_r4'), null) ->> 'reinstated', 'false');
reset role;
select pg_temp.expect('...with the refund declined and nothing claimable', pg_temp.col('ths_r4','status') || '/' || pg_temp.rf('ths_r4','status') || '/' || (public.refund_claim(pg_temp.oid('ths_r4'), true) ->> 'claimed'), 'cancelled/declined/false');
select pg_temp.mk('ths_r5'); select pg_temp.pay('ths_r5');

\echo --- NOBODY CAN SKIP THE QUEUE BY WRITING TO THE TABLE
select pg_temp.as_('00000000-0000-0000-0000-0000000000b2','aal2'); set role authenticated;
select pg_temp.denied('staff cannot edit a refund record', $q$update public.order_refunds set status = 'requested'$q$);
select pg_temp.denied('...nor add one', format($q$insert into public.order_refunds (order_id, amount_ngn, status) values (%L, 5, 'requested')$q$, pg_temp.oid('ths_r5')));
select pg_temp.denied('...nor delete one', $q$delete from public.order_refunds$q$);
select pg_temp.expect('...but staff can SEE the queue', (select (count(*) > 0)::text from public.order_refunds), 'true');
select pg_temp.denied('staff cannot give themselves the permission', $q$update public.profiles set can_approve_refunds = true where id = '00000000-0000-0000-0000-0000000000b2'$q$);
select pg_temp.rejects('...nor use the admin switch', $q$select public.team_set_refunds('00000000-0000-0000-0000-0000000000b3', true)$q$);
reset role;
set role anon;
select pg_temp.denied('a visitor cannot see refunds', $q$select * from public.order_refunds$q$);
reset role;

\echo --- THE PERMISSION SWITCH
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select pg_temp.rejects('an admin cannot switch it for themselves', $q$select public.team_set_refunds('00000000-0000-0000-0000-0000000000a1', true)$q$);
select pg_temp.rejects('...nor for a customer', $q$select public.team_set_refunds('00000000-0000-0000-0000-0000000000c1', true)$q$);
select pg_temp.rejects('...nor leave it undecided', $q$select public.team_set_refunds('00000000-0000-0000-0000-0000000000b3', null)$q$);
select public.team_set_refunds('00000000-0000-0000-0000-0000000000b2', false);
select pg_temp.expect('the admin can switch it off again', (select can_approve_refunds::text from public.team_list() where id = '00000000-0000-0000-0000-0000000000b2'), 'false');
select public.team_set_refunds('00000000-0000-0000-0000-0000000000b2', true);
select public.team_set_role('00000000-0000-0000-0000-0000000000b2', 'staff', 'customer');
select public.team_set_role('00000000-0000-0000-0000-0000000000b2', 'customer', 'staff');
reset role;
select pg_temp.expect('removing and re-adding someone starts with it OFF', (select can_approve_refunds::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b2'), 'false');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b2','aal2'); set role authenticated;
select pg_temp.rejects('...and they can no longer approve', format($q$select public.approve_refund(%L)$q$, pg_temp.oid('ths_r2')));
reset role;
