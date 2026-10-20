-- Category photo column + existing category access rules. Every check prints "ok ..." or "FAIL ...".
\pset tuples_only on
create or replace function pg_temp.expect(label text, actual text, expected text) returns void language plpgsql as $$
begin if actual is not distinct from expected then raise notice 'ok  %', label; else raise notice 'FAIL % (got %, wanted %)', label, actual, expected; end if; end $$;
create or replace function pg_temp.as_(uid text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',uid,'aal',aal)::text, false); end $$;
create or replace function pg_temp.denied(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was allowed)', label; exception when insufficient_privilege then raise notice 'ok  % (permission denied)', label; when others then raise notice 'FAIL % (wrong error: %)', label, sqlstate; end; end $$;
create or replace function pg_temp.rejects(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was accepted)', label; exception when others then raise notice 'ok  % (%)', label, sqlstate; end; end $$;

insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','boss@shop.com'),('00000000-0000-0000-0000-0000000000b1','till@shop.com'),('00000000-0000-0000-0000-0000000000c1','cust@x');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='staff' where id='00000000-0000-0000-0000-0000000000b1';

\echo --- anon / customer / staff cannot write categories, even with a photo
set role anon;
select pg_temp.denied('anon cannot add a category', $q$insert into public.categories(name,slug,image_url) values ('Skincare','skincare','https://x.supabase.co/a.jpg')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal2'); set role authenticated;
select pg_temp.denied('a signed-in customer cannot add a category', $q$insert into public.categories(name,slug) values ('Skincare','skincare')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.denied('STAFF (not admin) cannot add a category', $q$insert into public.categories(name,slug) values ('Skincare','skincare')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal1'); set role authenticated;
select pg_temp.denied('admin WITHOUT two-factor cannot add a category', $q$insert into public.categories(name,slug) values ('Skincare','skincare')$q$);
reset role;

\echo --- admin with two-factor: add, edit the photo, delete
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
insert into public.categories(name,slug,description,image_url) values ('Skincare','skincare','Serums and cleansers','https://abcd.supabase.co/storage/v1/object/public/products/site/a.jpg');
select pg_temp.expect('category saved with its photo', (select image_url from public.categories where slug='skincare'), 'https://abcd.supabase.co/storage/v1/object/public/products/site/a.jpg');
update public.categories set image_url = null where slug='skincare';
select pg_temp.expect('the photo can be removed again (no photo = illustration on the shop)', (select image_url is null from public.categories where slug='skincare')::text, 'true');
select pg_temp.rejects('a photo link over 500 characters is refused', $q$update public.categories set image_url = repeat('a', 501) where slug='skincare'$q$);
insert into public.categories(name,slug) values ('Hair Care','hair-care');
select pg_temp.rejects('a duplicate name is refused', $q$insert into public.categories(name,slug) values ('Skincare','skincare-2')$q$);
select pg_temp.rejects('a duplicate slug is refused', $q$insert into public.categories(name,slug) values ('Skincare 2','skincare')$q$);
insert into public.products (sku,slug,name,brand,category_id,price_ngn,stock) select 'S1','s1','Serum','B',id,10000,5 from public.categories where slug='skincare';
select pg_temp.rejects('a category still used by a product cannot be deleted', $q$delete from public.categories where slug='skincare'$q$);
delete from public.categories where slug='hair-care';
select pg_temp.expect('an unused category can be deleted', (select count(*)::text from public.categories where slug='hair-care'), '0');
reset role;

\echo --- everyone can still read categories and their photos (public shop)
set role anon;
select pg_temp.expect('anon can read categories', (select count(*)::text from public.categories), '1');
reset role;
