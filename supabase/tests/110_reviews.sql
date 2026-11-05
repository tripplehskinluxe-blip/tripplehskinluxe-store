-- Reviews: only real, delivered purchases; one per product per order; staff can remove; nobody writes directly. "ok ..." or "FAIL ...".
\pset tuples_only on
create or replace function pg_temp.expect(label text, actual text, expected text) returns void language plpgsql as $$
begin if actual is not distinct from expected then raise notice 'ok  %', label; else raise notice 'FAIL % (got %, wanted %)', label, actual, expected; end if; end $$;
create or replace function pg_temp.as_(uid text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',uid,'aal',aal)::text, false); end $$;
create or replace function pg_temp.rejects(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was accepted)', label; exception when others then raise notice 'ok  % (%)', label, sqlerrm; end; end $$;
create or replace function pg_temp.denied(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was allowed)', label; exception when insufficient_privilege then raise notice 'ok  % (permission denied)', label; when others then raise notice 'FAIL % (wrong error: %)', label, sqlerrm; end; end $$;
create or replace function pg_temp.rows(sql text) returns text language plpgsql as $$ declare n int; begin execute sql; get diagnostics n = row_count; return n::text; end $$;
create or replace function pg_temp.oid(ref text) returns uuid language sql as $$ select id from public.orders where paystack_reference = ref $$;
create or replace function pg_temp.pid(s text) returns uuid language sql as $$ select id from public.products where sku = s $$;
create or replace function pg_temp.mk(ref text) returns text language sql as $$
  select public.create_online_order(jsonb_build_object('reference',ref,'name','Ada Obi','email','a@x.co','phone','08012345678',
    'address','{"state":"Lagos","city":"Yaba","address":"1 Road"}'::jsonb,
    'items', jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='S1'),'qty',1), jsonb_build_object('product_id',(select id from public.products where sku='S2'),'qty',1)),
    'subtotal',15000,'delivery',2000,'discount',0,'discount_code','','total',17000,'delivery_method','delivery')) $$;
create or replace function pg_temp.pay(ref text) returns text language sql as $$ select public.mark_order_paid(ref, (select total_ngn::bigint * 100 from public.orders where paystack_reference = ref)) $$;
create or replace function pg_temp.sub(tok text, prod text, rating int, nm text default 'Ada', body text default 'Lovely') returns text language sql as $$
  select public.submit_review(tok, pg_temp.pid(prod), rating, nm, body) ->> 'code' $$;

insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','boss@shop.com'),('00000000-0000-0000-0000-0000000000b1','till@shop.com'),('00000000-0000-0000-0000-0000000000c1','buyer@x.com');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='staff' where id='00000000-0000-0000-0000-0000000000b1';
insert into public.categories(name,slug) values ('Skincare','skincare');
insert into public.products (sku,slug,name,brand,price_ngn,stock) values ('S1','s1','Serum','B',10000,50),('S2','s2','Cleanser','B',5000,50);

\echo --- WHO GETS A REVIEW LINK
select pg_temp.mk('ths_r1');
select pg_temp.expect('an UNPAID order gets no link', (public.issue_review_token(pg_temp.oid('ths_r1')) is null)::text, 'true');
select pg_temp.pay('ths_r1');
select pg_temp.expect('a paid order that is not delivered yet gets no link', (public.issue_review_token(pg_temp.oid('ths_r1')) is null)::text, 'true');
update public.orders set status = 'delivered' where paystack_reference = 'ths_r1';
create temp table tok as select public.issue_review_token(pg_temp.oid('ths_r1')) t;
select pg_temp.expect('a delivered, paid order gets a 64-character link', (select (t ~ '^[0-9a-f]{64}$')::text from tok), 'true');
select pg_temp.expect('the link itself is NOT stored (only its fingerprint)', (select count(*)::text from public.review_tokens where token_hash = (select t from tok)), '0');
select pg_temp.expect('...the fingerprint is', (select count(*)::text from public.review_tokens where token_hash = encode(sha256(convert_to((select t from tok), 'UTF8')), 'hex')), '1');
select pg_temp.expect('a made-up link shows nothing', public.review_context('abc') ->> 'code', 'invalid');
select pg_temp.expect('an empty link shows nothing', public.review_context('') ->> 'code', 'invalid');
select pg_temp.expect('a missing link shows nothing', public.review_context(null) ->> 'code', 'invalid');
select pg_temp.expect('the real link lists both products, none reviewed yet', ((select (public.review_context(t) -> 'items')::jsonb from tok) @> '[{"reviewed": false}]'::jsonb)::text, 'true');
select pg_temp.expect('...two products', (select jsonb_array_length(public.review_context(t) -> 'items')::text from tok), '2');
select pg_temp.expect('the page greets the buyer by first name', (select public.review_context(t) ->> 'first_name' from tok), 'Ada');

\echo --- WRITING A REVIEW
select pg_temp.expect('a stranger link is refused', pg_temp.sub('0000', 'S1', 5), 'invalid');
select pg_temp.expect('a rating of 0 is refused', pg_temp.sub((select t from tok), 'S1', 0), 'bad_input');
select pg_temp.expect('a rating of 6 is refused', pg_temp.sub((select t from tok), 'S1', 6), 'bad_input');
select pg_temp.expect('no rating is refused', pg_temp.sub((select t from tok), 'S1', null), 'bad_input');
select pg_temp.expect('an empty name is refused', pg_temp.sub((select t from tok), 'S1', 5, '   '), 'bad_input');
select pg_temp.expect('a 41-character name is refused', pg_temp.sub((select t from tok), 'S1', 5, repeat('n', 41)), 'bad_input');
select pg_temp.expect('a 1001-character review is refused', pg_temp.sub((select t from tok), 'S1', 5, 'Ada', repeat('x', 1001)), 'bad_input');
select pg_temp.expect('a link inside a review is refused', pg_temp.sub((select t from tok), 'S1', 5, 'Ada', 'buy at www.spam.com'), 'no_links');
select pg_temp.expect('...also https', pg_temp.sub((select t from tok), 'S1', 5, 'Ada', 'see https://spam.example'), 'no_links');
insert into public.products (sku,slug,name,brand,price_ngn,stock) values ('S3','s3','Toner','B',3000,50);
select pg_temp.expect('a product that is NOT in this order cannot be reviewed', pg_temp.sub((select t from tok), 'S3', 5), 'not_in_order');
select pg_temp.expect('a good review is accepted', pg_temp.sub((select t from tok), 'S1', 4, '  Ada O.  ', '  Works well  '), 'ok');
select pg_temp.expect('...and is published immediately, tied to the order, trimmed', (select status || '/' || (order_id = pg_temp.oid('ths_r1'))::text || '/' || name || '/' || body from public.reviews where product_id = pg_temp.pid('S1')), 'published/true/Ada O./Works well');
select pg_temp.expect('the product rating updates by itself', (select rating_avg::text || '/' || review_count::text from public.products where sku = 'S1'), '4.0/1');
select pg_temp.expect('a second review of the same product from the same order is refused', pg_temp.sub((select t from tok), 'S1', 1), 'already');
select pg_temp.expect('the other product in the order can still be reviewed', pg_temp.sub((select t from tok), 'S2', 5, 'Ada', ''), 'ok');
select pg_temp.expect('a rating alone (no text) is fine', (select body from public.reviews where product_id = pg_temp.pid('S2')), '');
select pg_temp.expect('the page now shows both as reviewed', ((select (public.review_context(t) -> 'items')::text from tok) !~ 'false')::text, 'true');
select pg_temp.rejects('the table itself allows only one review per product per order', format($q$insert into public.reviews (product_id, order_id, name, rating, body) values (%L, %L, 'X', 5, '')$q$, pg_temp.pid('S1'), pg_temp.oid('ths_r1')));

\echo --- LINKS EXPIRE AND ARE LIMITED
update public.review_tokens set expires_at = now() - interval '1 day';
select pg_temp.expect('an expired link no longer works', public.review_context((select t from tok)) ->> 'code', 'invalid');
select pg_temp.expect('...and cannot submit', pg_temp.sub((select t from tok), 'S1', 5), 'invalid');
create temp table tok2 as select public.issue_review_token(pg_temp.oid('ths_r1')) t;
select pg_temp.expect('a fresh link works', public.review_context((select t from tok2)) ->> 'code', 'ok');
select public.issue_review_token(pg_temp.oid('ths_r1')) from generate_series(1, 8);
select pg_temp.expect('at most 5 live links per order', (select count(*)::text from public.review_tokens where order_id = pg_temp.oid('ths_r1')), '5');
create temp table tok3 as select public.issue_review_token(pg_temp.oid('ths_r1')) t;
select pg_temp.expect('the newest link works', public.review_context((select t from tok3)) ->> 'code', 'ok');
update public.orders set status = 'shipped' where paystack_reference = 'ths_r1';
select pg_temp.expect('an order that is not delivered cannot be reviewed', public.review_context((select t from tok3)) ->> 'code', 'invalid');
update public.orders set status = 'delivered' where paystack_reference = 'ths_r1';

\echo --- WHO CAN TOUCH WHAT
set role anon;
select pg_temp.denied('a visitor cannot make review links', $q$select public.issue_review_token('00000000-0000-0000-0000-000000000001')$q$);
select pg_temp.denied('a visitor cannot call the review page lookup', $q$select public.review_context('x')$q$);
select pg_temp.denied('a visitor cannot submit through the database', $q$select public.submit_review('x', null, 5, 'a', 'b')$q$);
select pg_temp.denied('a visitor cannot read the review links', $q$select * from public.review_tokens$q$);
select pg_temp.denied('a visitor cannot write a review directly', $q$insert into public.reviews (product_id, name, rating, body) values (null, 'x', 5, '')$q$);
select pg_temp.expect('a visitor sees the published reviews', (select count(*)::text from public.reviews), '2');
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal1'); set role authenticated;
select pg_temp.denied('a signed-in customer cannot write a review directly (the old way is closed)', format($q$insert into public.reviews (product_id, user_id, name, rating, body, status) values (%L, auth.uid(), 'x', 5, '', 'published')$q$, (select id from public.products where sku='S3')));
select pg_temp.denied('...nor call the review functions', $q$select public.submit_review('x', null, 5, 'a', 'b')$q$);
select pg_temp.denied('...nor read the review links', $q$select * from public.review_tokens$q$);
select pg_temp.expect('...and cannot change a review (0 rows)', pg_temp.rows($q$update public.reviews set status = 'hidden'$q$), '0');
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.denied('staff cannot read the review links either', $q$select * from public.review_tokens$q$);
reset role;

\echo --- STAFF CAN REMOVE A REVIEW
create temp table ids as select 'r' k, id from public.reviews where product_id = (select id from public.products where sku='S1');
grant select on ids to public;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.expect('staff can remove a review (it is hidden)', pg_temp.rows(format($q$update public.reviews set status = 'hidden' where id = %L$q$, (select id from ids))), '1');
select pg_temp.denied('staff cannot edit what a review says', format($q$update public.reviews set body = 'edited' where id = %L$q$, (select id from ids)));
select pg_temp.denied('...or its rating', format($q$update public.reviews set rating = 1 where id = %L$q$, (select id from ids)));
select pg_temp.denied('...or who wrote it', format($q$update public.reviews set name = 'someone' where id = %L$q$, (select id from ids)));
select pg_temp.expect('staff still see the removed review', (select count(*)::text from public.reviews where status = 'hidden'), '1');
reset role;
select pg_temp.expect('who removed it and when is recorded', (select (removed_by = '00000000-0000-0000-0000-0000000000b1')::text || '/' || (removed_at is not null)::text from public.reviews where id = (select id from ids)), 'true/true');
select pg_temp.expect('the removal is in the audit log', (select count(*)::text from public.audit_log where action = 'review_remove' and actor = '00000000-0000-0000-0000-0000000000b1'), '1');
select pg_temp.expect('the product rating drops it automatically', (select review_count::text from public.products where sku = 'S1'), '0');
set role anon;
select pg_temp.expect('visitors no longer see it', (select count(*)::text from public.reviews), '1');
reset role;
select pg_temp.expect('the buyer cannot write a replacement for a removed review', pg_temp.sub((select t from tok3), 'S1', 5), 'already');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.expect('staff can restore it', pg_temp.rows(format($q$update public.reviews set status = 'published' where id = %L$q$, (select id from ids))), '1');
reset role;
select pg_temp.expect('a restored review is public again and counted', (select review_count::text from public.products where sku = 'S1'), '1');
select pg_temp.expect('the restore is in the audit log', (select count(*)::text from public.audit_log where action = 'review_restore'), '1');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal1'); set role authenticated;
select pg_temp.expect('staff WITHOUT two-factor cannot remove anything (0 rows)', pg_temp.rows($q$update public.reviews set status = 'hidden'$q$), '0');
select pg_temp.expect('...and cannot delete', pg_temp.rows($q$delete from public.reviews$q$), '0');
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.expect('staff cannot erase a review for good (0 rows)', pg_temp.rows($q$delete from public.reviews$q$), '0');
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select pg_temp.expect('only an admin can erase one', pg_temp.rows(format($q$delete from public.reviews where id = %L$q$, (select id from ids))), '1');
reset role;
