\pset tuples_only on
create or replace function pg_temp.expect(label text, actual text, expected text) returns void language plpgsql as $$
begin if actual is not distinct from expected then raise notice 'ok  %', label; else raise notice 'FAIL % (got %, wanted %)', label, actual, expected; end if; end $$;
create or replace function pg_temp.rejects(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was accepted)', label; exception when others then raise notice 'ok  % (refused)', label; end; end $$;

select pg_temp.expect('all 20 Lagos local governments are present', (select count(*)::text from public.shipping_lgas), '20');
select pg_temp.expect('every local government has a zone', (select count(*)::text from public.shipping_lgas l join public.shipping_zones z on z.id = l.zone_id), '20');
select pg_temp.expect('Eti-Osa is on Lagos Island', (select z.name from public.shipping_lgas l join public.shipping_zones z on z.id=l.zone_id where l.name='Eti-Osa'), 'Lagos Island');
select pg_temp.expect('Ojo starts on Lagos Mainland until it gets its own zone', (select z.name from public.shipping_lgas l join public.shipping_zones z on z.id=l.zone_id where l.name='Ojo'), 'Lagos Mainland');
select pg_temp.expect('Lagos Mainland zone price is the Bumpa price (3500)', (select fee_ngn::text from public.shipping_zones where name='Lagos Mainland'), '3500');
select pg_temp.expect('Yaba zone price is the Bumpa price (2000)', (select fee_ngn::text from public.shipping_zones where name='Yaba'), '2000');
select pg_temp.expect('Lagos Island zone price is the Bumpa price (4500)', (select fee_ngn::text from public.shipping_zones where name='Lagos Island'), '4500');
select pg_temp.expect('Inter-state price is blank for the admin', (select (fee_ngn is null)::text from public.shipping_zones where kind='interstate'), 'true');
select pg_temp.expect('Imude is a specific area of Ojo', (select count(*)::text from public.shipping_areas where lga='Ojo' and name='Imude'), '1');
select pg_temp.expect('Imude alias Imude-Shibiri is stored', (select aliases::text from public.shipping_areas where lga='Ojo' and name='Imude'), '{Imude-Shibiri}');
select pg_temp.expect('Yaba area uses the Yaba zone', (select z.name from public.shipping_areas a join public.shipping_zones z on z.id=a.zone_id where a.name='Yaba'), 'Yaba');
select pg_temp.expect('an area with no zone of its own uses its local government zone', (select (zone_id is null)::text from public.shipping_areas where name='Imude'), 'true');
select pg_temp.rejects('an unknown local government cannot be added', $q$insert into public.shipping_lgas (name, zone_id) select 'Nowhere', id from public.shipping_zones limit 1$q$);
select pg_temp.rejects('a second Inter-state zone cannot be added', $q$insert into public.shipping_zones (name, kind) values ('Another interstate','interstate')$q$);
select pg_temp.rejects('a negative fee is refused', $q$update public.shipping_zones set fee_ngn = -1 where name='Yaba'$q$);
select pg_temp.rejects('the same area cannot be listed twice in one local government', $q$insert into public.shipping_areas (lga,name) values ('Ojo','Imude')$q$);
select pg_temp.rejects('a zone cannot be deleted while a local government uses it', $q$delete from public.shipping_zones where name='Lagos Island'$q$);
select pg_temp.expect('the browser role cannot read the zones directly', (select has_table_privilege('anon','public.shipping_zones','SELECT'))::text, 'false');
