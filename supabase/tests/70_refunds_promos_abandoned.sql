-- Promo limits, refunds and auto-cancel of abandoned checkouts. Every check prints "ok ..." or "FAIL ...".
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
create or replace function pg_temp.mk(ref text, qty int, code text default '', disc int default 0) returns text language sql as $$
 select public.create_online_order(jsonb_build_object('reference',ref,'name','Ada','email','a@x.co','phone','08012345678','address','{"state":"Lagos"}'::jsonb,
  'items', jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='S1'),'qty',qty)),
  'subtotal',10000*qty,'delivery',2000,'discount',disc,'discount_code',code,'total',10000*qty+2000-disc)) $$;
create or replace function pg_temp.pay(ref text) returns text language sql as $$ select public.mark_order_paid(ref, (select total_ngn::bigint * 100 from public.orders where paystack_reference = ref)) $$;

insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','boss@shop.com'),('00000000-0000-0000-0000-0000000000b1','till@shop.com'),('00000000-0000-0000-0000-0000000000c1','cust@x');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='staff' where id='00000000-0000-0000-0000-0000000000b1';
insert into public.categories(name,slug) values ('Skincare','skincare');
insert into public.products (sku,slug,name,brand,price_ngn,stock) values ('S1','s1','Serum','B',10000,20);

\echo --- PROMO LIMITS
insert into public.discounts(code,type,value,min_order_ngn,max_uses,expires_at) values ('PROMO50','percent',10,0,50,'2026-12-30 23:59:59+01'), ('ONCE','fixed',1000,0,1,null), ('FREE4ALL','fixed',500,0,null,null);
select pg_temp.expect('a code can have 50 uses and an expiry date', (select max_uses::text || ' / ' || to_char(expires_at at time zone 'Africa/Lagos', 'YYYY-MM-DD HH24:MI') from public.discounts where code='PROMO50'), '50 / 2026-12-30 23:59');
select pg_temp.expect('empty = unlimited and never expires', (select (max_uses is null and expires_at is null)::text from public.discounts where code='FREE4ALL'), 'true');
select pg_temp.rejects('a limit of 0 is refused', $q$insert into public.discounts(code,type,value,max_uses) values ('BAD','fixed',5,0)$q$);
select pg_temp.rejects('a negative limit is refused', $q$insert into public.discounts(code,type,value,max_uses) values ('BAD2','fixed',5,-3)$q$);
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
update public.discounts set max_uses = 99999 where code = 'PROMO50';
reset role;
select pg_temp.expect('STAFF cannot raise a promo limit', (select max_uses::text from public.discounts where code='PROMO50'), '50');
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
update public.discounts set max_uses = 60 where code = 'PROMO50';
reset role;
select pg_temp.expect('an admin (2FA) can change it', (select max_uses::text from public.discounts where code='PROMO50'), '60');

set role service_role;
select pg_temp.mk('ths_u1', 1, 'ONCE', 1000); select pg_temp.mk('ths_u2', 1, 'ONCE', 1000);
select pg_temp.expect('first paid order using a 1-use code is fine', pg_temp.pay('ths_u1'), 'paid');
select pg_temp.expect('...and the use is counted', (select uses::text from public.discounts where code='ONCE'), '1');
select pg_temp.expect('...and not flagged', pg_temp.col('ths_u1','needs_attention'), 'false');
select pg_temp.expect('a second payment at the same moment still goes through (customer already paid)', pg_temp.pay('ths_u2'), 'paid');
select pg_temp.expect('...but the order is FLAGGED because the code went over its limit', pg_temp.col('ths_u2','needs_attention'), 'true');
select pg_temp.expect('unlimited codes are never flagged', (select pg_temp.mk('ths_u3', 1, 'FREE4ALL', 500) is not null)::text || '/' || pg_temp.pay('ths_u3') || '/' || pg_temp.col('ths_u3','needs_attention'), 'true/paid/false');
reset role;

\echo --- REFUNDS
set role service_role;
select pg_temp.mk('ths_p1', 2); select pg_temp.expect('paid order takes stock (20 -> 18 so far, other orders took more)', pg_temp.pay('ths_p1'), 'paid');
select pg_temp.mk('ths_x1', 1);                    -- never paid
reset role;
update public.products set stock = 20;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select public.set_order_status((select id from public.orders where paystack_reference='ths_p1'), 'cancelled');
select public.set_order_status((select id from public.orders where paystack_reference='ths_x1'), 'cancelled');
reset role;
select pg_temp.expect('cancelling a PAID order: order is cancelled', pg_temp.col('ths_p1','status'), 'cancelled');
select pg_temp.expect('...the money is still recorded as paid (not silently "refunded")', pg_temp.col('ths_p1','payment_status'), 'paid');
select pg_temp.expect('...and it is FLAGGED "refund due"', pg_temp.col('ths_p1','needs_attention'), 'true');
select pg_temp.expect('cancelling an UNPAID order is not flagged', pg_temp.col('ths_x1','needs_attention'), 'false');
select pg_temp.expect('the cancel is in the audit log with refund_due', (select (meta ->> 'refund_due') from public.audit_log where action='cancel_order' and entity_id = (select id::text from public.orders where paystack_reference='ths_p1')), 'true');

select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.rejects('STAFF cannot mark a refund done', $q$select public.mark_order_refunded((select id from public.orders where paystack_reference='ths_p1'), 'x')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal2'); set role authenticated;
select pg_temp.rejects('a customer cannot', $q$select public.mark_order_refunded((select id from public.orders where paystack_reference='ths_p1'), 'x')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal1'); set role authenticated;
select pg_temp.rejects('an admin WITHOUT two-factor cannot', $q$select public.mark_order_refunded((select id from public.orders where paystack_reference='ths_p1'), 'x')$q$);
reset role;
set role anon;
select pg_temp.denied('anon cannot', $q$select public.mark_order_refunded('00000000-0000-0000-0000-000000000000', 'x')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select pg_temp.rejects('refusing an order that is not cancelled', $q$select public.mark_order_refunded((select id from public.orders where paystack_reference='ths_u1'), 'x')$q$);
select pg_temp.rejects('refusing a cancelled order that was never paid', $q$select public.mark_order_refunded((select id from public.orders where paystack_reference='ths_x1'), 'x')$q$);
select public.mark_order_refunded((select id from public.orders where paystack_reference='ths_p1'), 'Paystack refund ref RF-123');
reset role;
select pg_temp.expect('admin (2FA) marks it refunded: payment_status', pg_temp.col('ths_p1','payment_status'), 'refunded');
select pg_temp.expect('...and the "refund due" flag is cleared', pg_temp.col('ths_p1','needs_attention'), 'false');
select pg_temp.expect('...with the note and amount in the audit log', (select (meta ->> 'note') || ' / ' || (meta ->> 'amount') from public.audit_log where action='mark_refunded'), 'Paystack refund ref RF-123 / 22000');
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select pg_temp.rejects('cannot be refunded twice', $q$select public.mark_order_refunded((select id from public.orders where paystack_reference='ths_p1'), 'again')$q$);
reset role;

\echo --- ABANDONED CHECKOUTS
set role service_role;
select pg_temp.mk('ths_old', 1); select pg_temp.mk('ths_new', 1); select pg_temp.mk('ths_paidold', 1); select pg_temp.mk('ths_failedold', 1); select pg_temp.mk('ths_30h', 1);
select pg_temp.pay('ths_paidold');
reset role;
update public.orders set created_at = now() - interval '80 hours' where paystack_reference = 'ths_old';
update public.orders set created_at = now() - interval '10 hours' where paystack_reference = 'ths_new';
update public.orders set created_at = now() - interval '100 hours' where paystack_reference = 'ths_paidold';
update public.orders set created_at = now() - interval '100 hours', payment_status = 'failed' where paystack_reference = 'ths_failedold';
update public.orders set created_at = now() - interval '30 hours' where paystack_reference = 'ths_30h';
insert into public.orders (order_number, channel, payment_method, subtotal_ngn, total_ngn, status, payment_status, created_at, customer_name) values ('STORE-OLD','store','cash',100,100,'pending','unpaid', now() - interval '200 hours', 'Walk-in');
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select pg_temp.denied('even an admin cannot run the cleanup from the browser', 'select public.cancel_abandoned_orders()');
reset role;
set role anon; select pg_temp.denied('anon cannot run the cleanup', 'select public.cancel_abandoned_orders()'); reset role;
set role service_role;
select pg_temp.expect('cleanup cancels the unpaid + failed orders older than 72 hours (2)', public.cancel_abandoned_orders()::text, '2');
select pg_temp.expect('running it again changes nothing', public.cancel_abandoned_orders()::text, '0');
reset role;
select pg_temp.expect('old unpaid order is cancelled', pg_temp.col('ths_old','status'), 'cancelled');
select pg_temp.expect('old failed-payment order is cancelled', pg_temp.col('ths_failedold','status'), 'cancelled');
select pg_temp.expect('a recent unpaid order (10h) is left alone', pg_temp.col('ths_new','status'), 'pending');
select pg_temp.expect('a 30h order is left alone with the default 72h', pg_temp.col('ths_30h','status'), 'pending');
select pg_temp.expect('a PAID order is never touched, however old', pg_temp.col('ths_paidold','status'), 'processing');
select pg_temp.expect('in-store orders are never touched', (select status from public.orders where order_number='STORE-OLD'), 'pending');
select pg_temp.expect('the run is in the audit log', (select (meta ->> 'count') || ' @ ' || (meta ->> 'after_hours') from public.audit_log where action='auto_cancel_abandoned'), '2 @ 72');

insert into public.settings(key,value) values ('delivery','{"abandonAfterHours": 24}') on conflict (key) do update set value = excluded.value;
set role service_role;
select pg_temp.expect('the number of hours comes from Settings: with 24h the 30h order is cancelled', public.cancel_abandoned_orders()::text, '1');
reset role;
select pg_temp.expect('...and the 10h order is still waiting', pg_temp.col('ths_new','status'), 'pending');
update public.settings set value = '{"abandonAfterHours": "abc"}' where key = 'delivery';
update public.orders set created_at = now() - interval '73 hours' where paystack_reference = 'ths_new';
set role service_role;
select pg_temp.expect('a damaged setting falls back to 72 hours', public.cancel_abandoned_orders()::text, '1');
reset role;

\echo --- a customer who pays AFTER the auto-cancel is not lost
set role service_role;
select pg_temp.expect('late payment is kept and flagged, the order is not revived', pg_temp.pay('ths_old'), 'paid_cancelled');
reset role;
select pg_temp.expect('...still cancelled, payment recorded, flagged for a person', pg_temp.col('ths_old','status') || '/' || pg_temp.col('ths_old','payment_status') || '/' || pg_temp.col('ths_old','needs_attention'), 'cancelled/paid/true');
