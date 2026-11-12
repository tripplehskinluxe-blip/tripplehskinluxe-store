-- Subcategories: starting lists, rules, who may change them, and what a rename or removal does to products. "ok ..." or "FAIL ...".
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

insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','boss@shop.com'),('00000000-0000-0000-0000-0000000000b1','till@shop.com'),('00000000-0000-0000-0000-0000000000c1','buyer@x.com');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='staff' where id='00000000-0000-0000-0000-0000000000b1';
insert into public.categories(name,slug) values ('Skincare','skincare'),('Hair Care','hair-care'),('Makeup','makeup');
create temp table cat as select slug k, id from public.categories;
grant select on cat to public;
create or replace function pg_temp.cid(k text) returns uuid language sql as $$ select id from cat where cat.k = $1 $$;

\echo --- THE STARTING LISTS (optional seed)
\ir ../015b_seed_subcategories.sql
select pg_temp.expect('Skincare starts with 12 subcategories', (select count(*)::text from public.subcategories where category_id = pg_temp.cid('skincare')), '12');
select pg_temp.expect('...grouped as Body Care 3, Face 7, Lip 2', (select string_agg(g || ':' || n, ',' order by g) from (select group_name g, count(*) n from public.subcategories where category_id = pg_temp.cid('skincare') group by group_name) x), 'Body Care:3,Face:7,Lip:2');
select pg_temp.expect('Hair Care starts with 3, no group headings', (select count(*)::text from public.subcategories where category_id = pg_temp.cid('hair-care') and group_name is null), '3');
select pg_temp.expect('a category that is not in the seed gets nothing', (select count(*)::text from public.subcategories where category_id = pg_temp.cid('makeup')), '0');
\ir ../015b_seed_subcategories.sql
select pg_temp.expect('running the seed again creates no duplicates', (select count(*)::text from public.subcategories), '15');

\echo --- THE RULES ON EVERY ROW
select pg_temp.rejects('an empty name is refused', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'','x')$q$, pg_temp.cid('skincare')));
select pg_temp.rejects('a comma in a name is refused', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'A,B','a-b')$q$, pg_temp.cid('skincare')));
select pg_temp.rejects('a quote in a name is refused', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'x"y','x-y')$q$, pg_temp.cid('skincare')));
select pg_temp.rejects('brackets in a name are refused', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'a(b)','ab')$q$, pg_temp.cid('skincare')));
select pg_temp.rejects('a 61-character name is refused', format($q$insert into public.subcategories (category_id,name,slug) values (%L,repeat('n',61),'long')$q$, pg_temp.cid('skincare')));
select pg_temp.rejects('a name with spaces around it is refused', format($q$insert into public.subcategories (category_id,name,slug) values (%L,' Padded','padded')$q$, pg_temp.cid('skincare')));
select pg_temp.rejects('a 41-character group heading is refused', format($q$insert into public.subcategories (category_id,name,group_name,slug) values (%L,'Okay',repeat('g',41),'okay')$q$, pg_temp.cid('skincare')));
select pg_temp.rejects('a web address with spaces or capitals is refused', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'Okay','Bad Slug')$q$, pg_temp.cid('skincare')));
select pg_temp.rejects('a web address with a double hyphen is refused', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'Okay','bad--slug')$q$, pg_temp.cid('skincare')));
select pg_temp.rejects('an order above 999 is refused', format($q$insert into public.subcategories (category_id,name,slug,sort) values (%L,'Okay','okay',1000)$q$, pg_temp.cid('skincare')));
select pg_temp.rejects('the same name twice in one category is refused', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'Serums','serums-two')$q$, pg_temp.cid('skincare')));
select pg_temp.rejects('the same web address twice in one category is refused', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'Serum Two','serums')$q$, pg_temp.cid('skincare')));
insert into public.subcategories (category_id,name,slug) values (pg_temp.cid('hair-care'),'Treatments','treatments');
select pg_temp.expect('the same name in a DIFFERENT category is fine', (select count(*)::text from public.subcategories where name = 'Treatments'), '2');

\echo --- RENAMING AND REMOVING NEVER LOSES A PRODUCT
insert into public.products (sku,slug,name,brand,price_ngn,stock,category_id,subcategory) values
  ('P1','p1','A','B',1000,5,pg_temp.cid('skincare'),'Serums'), ('P2','p2','B','B',1000,5,pg_temp.cid('skincare'),'Serums'),
  ('P3','p3','C','B',1000,5,pg_temp.cid('hair-care'),'Serums'), ('P4','p4','D','B',1000,5,pg_temp.cid('skincare'),'Toners'),
  ('P5','p5','E','B',1000,5,pg_temp.cid('skincare'),null);
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
update public.subcategories set name = 'Face Serums', slug = 'face-serums' where category_id = pg_temp.cid('skincare') and name = 'Serums';
reset role;
select pg_temp.expect('a rename updates the products in that category', (select string_agg(subcategory, ',' order by sku) from public.products where sku in ('P1','P2')), 'Face Serums,Face Serums');
select pg_temp.expect('...but not a product of another category that happens to use the old word', (select subcategory from public.products where sku = 'P3'), 'Serums');
select pg_temp.expect('...and not other subcategories', (select subcategory from public.products where sku = 'P4'), 'Toners');
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select pg_temp.rejects('a subcategory cannot be moved to another category', format($q$update public.subcategories set category_id = %L where name = 'Face Serums'$q$, pg_temp.cid('hair-care')));
delete from public.subcategories where category_id = pg_temp.cid('skincare') and name = 'Toners';
reset role;
select pg_temp.expect('removing a subcategory keeps the product...', (select count(*)::text from public.products), '5');
select pg_temp.expect('...in its category, with no subcategory', (select (subcategory is null)::text || '/' || (category_id = pg_temp.cid('skincare'))::text from public.products where sku = 'P4'), 'true/true');
select pg_temp.expect('...and other products are untouched', (select subcategory from public.products where sku = 'P1'), 'Face Serums');
select pg_temp.expect('the cleanup functions cannot be called by shoppers or staff', (has_function_privilege('anon', 'public.subcategories_sync()', 'execute') or has_function_privilege('authenticated', 'public.subcategories_sync()', 'execute'))::text, 'false');

\echo --- WHO MAY CHANGE THEM
create temp table n_now as select count(*) n from public.subcategories;
grant select on n_now to public;
set role anon;
select pg_temp.expect('a visitor can read them all', (select count(*)::text from public.subcategories), (select n::text from n_now));
select pg_temp.denied('a visitor cannot add one', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'Hack','hack')$q$, pg_temp.cid('skincare')));
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal1'); set role authenticated;
select pg_temp.rejects('a customer cannot add one', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'Hack','hack')$q$, pg_temp.cid('skincare')));
select pg_temp.expect('...nor rename one (0 rows)', pg_temp.rows($q$update public.subcategories set name = 'Hacked'$q$), '0');
select pg_temp.expect('...nor remove one (0 rows)', pg_temp.rows($q$delete from public.subcategories$q$), '0');
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.rejects('staff cannot add one', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'Hack','hack')$q$, pg_temp.cid('skincare')));
select pg_temp.expect('...nor rename one (0 rows)', pg_temp.rows($q$update public.subcategories set name = 'Hacked'$q$), '0');
select pg_temp.expect('...nor remove one (0 rows)', pg_temp.rows($q$delete from public.subcategories$q$), '0');
select pg_temp.expect('...but staff can read them (for the product form)', (select count(*)::text from public.subcategories), (select n::text from n_now));
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal1'); set role authenticated;
select pg_temp.rejects('an admin WITHOUT two-factor cannot add one', format($q$insert into public.subcategories (category_id,name,slug) values (%L,'Hack','hack')$q$, pg_temp.cid('skincare')));
select pg_temp.expect('...nor remove one (0 rows)', pg_temp.rows($q$delete from public.subcategories$q$), '0');
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
insert into public.subcategories (category_id,name,group_name,slug,sort) values (pg_temp.cid('makeup'),'Lipsticks','Lips','lipsticks',1);
select pg_temp.expect('an admin with two-factor can add one', (select count(*)::text from public.subcategories where category_id = pg_temp.cid('makeup')), '1');
reset role;

\echo --- A CATEGORY THAT IS REMOVED TAKES ITS SUBCATEGORIES WITH IT
insert into public.categories(name,slug) values ('Temp','temp');
insert into public.subcategories (category_id,name,slug) values ((select id from public.categories where slug='temp'),'TempSub','tempsub');
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
delete from public.categories where slug = 'temp';
reset role;
select pg_temp.expect('its subcategories are gone, nothing else is', (select count(*)::text from public.subcategories where name = 'TempSub'), '0');
select pg_temp.expect('the other categories keep theirs', (select count(*)::text from public.subcategories where category_id = pg_temp.cid('hair-care')), '4');
