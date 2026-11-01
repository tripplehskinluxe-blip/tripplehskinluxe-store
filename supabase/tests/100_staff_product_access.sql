-- Staff product access: off by default, admin-controlled, never more than add/edit. Every check prints "ok ..." or "FAIL ...".
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
create or replace function pg_temp.price(s text) returns text language sql as $$ select price_ngn::text from public.products where sku = s $$;

insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','boss@shop.com'),('00000000-0000-0000-0000-0000000000b1','till@shop.com'),('00000000-0000-0000-0000-0000000000b2','shelf@shop.com'),('00000000-0000-0000-0000-0000000000c1','buyer@x.com');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='staff' where id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2');
insert into public.categories(name,slug) values ('Skincare','skincare');
insert into public.products (sku,slug,name,brand,price_ngn,stock) values ('P1','p1','Serum','B',10000,5);
create temp table ids as select 'b1'::text k, '00000000-0000-0000-0000-0000000000b1'::uuid id union all select 'b2','00000000-0000-0000-0000-0000000000b2' union all select 'a1','00000000-0000-0000-0000-0000000000a1' union all select 'c1','00000000-0000-0000-0000-0000000000c1';
grant select on ids to public;

\echo --- OFF BY DEFAULT
select pg_temp.expect('a new staff member does NOT have the permission', (select can_manage_products::text from public.profiles where id = (select id from ids where k='b1')), 'false');
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.expect('staff without it: can_edit_products is false', public.can_edit_products()::text, 'false');
select pg_temp.rejects('...cannot add a product', $q$insert into public.products (sku,slug,name,brand,price_ngn,stock) values ('X1','x1','X','B',1,1)$q$);
select pg_temp.expect('...cannot change a product (0 rows touched)', pg_temp.rows($q$update public.products set price_ngn = 1 where sku = 'P1'$q$), '0');
select pg_temp.rejects('...cannot upload a product photo', $q$insert into storage.objects (bucket_id, name) values ('products','nope.jpg')$q$);
reset role;
select pg_temp.expect('...and the price is untouched', pg_temp.price('P1'), '10000');

\echo --- THE ADMIN SWITCHES IT ON
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal1'); set role authenticated;
select pg_temp.rejects('an admin WITHOUT two-factor cannot switch it', format($q$select public.team_set_products(%L, true)$q$, (select id from ids where k='b1')));
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select public.team_set_products((select id from ids where k='b1'), true);
select pg_temp.expect('the team list shows who has it', (select can_manage_products::text from public.team_list() where id = (select id from ids where k='b1')), 'true');
select pg_temp.expect('...and who does not', (select can_manage_products::text from public.team_list() where id = (select id from ids where k='b2')), 'false');
select pg_temp.rejects('an admin cannot switch it for themselves', format($q$select public.team_set_products(%L, true)$q$, (select id from ids where k='a1')));
select pg_temp.rejects('...nor for a customer', format($q$select public.team_set_products(%L, true)$q$, (select id from ids where k='c1')));
select pg_temp.rejects('...nor leave it undecided', format($q$select public.team_set_products(%L, null)$q$, (select id from ids where k='b2')));
reset role;
select pg_temp.expect('the switch is written to the audit log', (select count(*)::text from public.audit_log where action = 'team_set_products' and entity_id = '00000000-0000-0000-0000-0000000000b1'), '1');

\echo --- WHAT PERMITTED STAFF CAN AND CANNOT DO
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.expect('can_edit_products is now true', public.can_edit_products()::text, 'true');
insert into public.products (sku,slug,name,brand,price_ngn,stock) values ('N1','n1','New thing','B',2000,3);
select pg_temp.expect('they can add a product', (select count(*)::text from public.products where sku = 'N1'), '1');
select pg_temp.expect('they can edit a product', pg_temp.rows($q$update public.products set price_ngn = 12000 where sku = 'P1'$q$), '1');
select pg_temp.expect('they can archive and restore (an edit)', pg_temp.rows($q$update public.products set is_active = false where sku = 'N1'$q$), '1');
insert into storage.objects (bucket_id, name) values ('products','new-photo.jpg');
select pg_temp.expect('they can upload a product photo', (select count(*)::text from storage.objects where name = 'new-photo.jpg'), '1');
select pg_temp.expect('they can NOT delete a product (0 rows)', pg_temp.rows($q$delete from public.products where sku = 'N1'$q$), '0');
select pg_temp.expect('they can NOT delete a photo (0 rows)', pg_temp.rows($q$delete from storage.objects where name = 'new-photo.jpg'$q$), '0');
select pg_temp.denied('they cannot give themselves the permission or any role', format($q$update public.profiles set can_manage_products = true where id = %L$q$, (select id from ids where k='b1')));
select pg_temp.denied('...nor change their own role', format($q$update public.profiles set role = 'admin' where id = %L$q$, (select id from ids where k='b1')));
select pg_temp.rejects('they cannot use the admin switch', format($q$select public.team_set_products(%L, true)$q$, (select id from ids where k='b2')));
select pg_temp.rejects('they cannot read the team list', $q$select * from public.team_list()$q$);
select pg_temp.expect('they still cannot touch categories', pg_temp.rows($q$update public.categories set name = 'Hacked'$q$), '0');
reset role;
select pg_temp.expect('the delete really did not happen', (select count(*)::text from public.products where sku = 'N1'), '1');

\echo --- THE TWO-FACTOR RULE STILL APPLIES
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal1'); set role authenticated;
select pg_temp.expect('permitted staff WITHOUT two-factor get nothing', public.can_edit_products()::text, 'false');
select pg_temp.expect('...so they cannot edit (0 rows)', pg_temp.rows($q$update public.products set price_ngn = 1 where sku = 'P1'$q$), '0');
reset role;

\echo --- THE AUDIT TRAIL
select pg_temp.expect('adding a product is logged with the person who did it', (select count(*)::text from public.audit_log where action = 'product_create' and actor = (select id from ids where k='b1')), '1');
select pg_temp.expect('a price change is logged with old and new price', (select (meta->'price')::text from public.audit_log where action = 'product_update' and entity_id = (select id::text from public.products where sku='P1') order by id desc limit 1), '[10000, 12000]');

\echo --- THE ADMIN SWITCHES IT OFF
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select public.team_set_products((select id from ids where k='b1'), false);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.expect('switched off: they cannot edit any more (0 rows)', pg_temp.rows($q$update public.products set price_ngn = 1 where sku = 'P1'$q$), '0');
select pg_temp.rejects('...nor add', $q$insert into public.products (sku,slug,name,brand,price_ngn,stock) values ('X2','x2','X','B',1,1)$q$);
reset role;
select pg_temp.expect('...and the price stayed', pg_temp.price('P1'), '12000');

\echo --- LOSING STAFF ACCESS RESETS IT
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select public.team_set_products((select id from ids where k='b2'), true);
select public.team_set_role((select id from ids where k='b2'), 'staff', 'customer');
select public.team_set_role((select id from ids where k='b2'), 'customer', 'staff');
reset role;
select pg_temp.expect('a removed-and-re-added staff member starts with it OFF', (select can_manage_products::text from public.profiles where id = (select id from ids where k='b2')), 'false');

\echo --- EVERYONE ELSE
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal1'); set role authenticated;
select pg_temp.expect('a customer cannot edit products', public.can_edit_products()::text, 'false');
select pg_temp.rejects('...nor add', $q$insert into public.products (sku,slug,name,brand,price_ngn,stock) values ('X3','x3','X','B',1,1)$q$);
reset role; set role anon;
select pg_temp.denied('a visitor cannot ask whether they may edit', $q$select public.can_edit_products()$q$);
select pg_temp.denied('a visitor cannot add a product', $q$insert into public.products (sku,slug,name,brand,price_ngn,stock) values ('X4','x4','X','B',1,1)$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select pg_temp.expect('an admin can edit', public.can_edit_products()::text, 'true');
select pg_temp.expect('an admin can still delete', pg_temp.rows($q$delete from public.products where sku = 'N1'$q$), '1');
reset role;
select pg_temp.expect('the delete is logged', (select count(*)::text from public.audit_log where action = 'product_delete'), '1');
