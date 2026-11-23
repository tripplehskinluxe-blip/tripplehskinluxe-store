\pset tuples_only on
create or replace function pg_temp.expect(label text, actual text, expected text) returns void language plpgsql as $$
begin if actual is not distinct from expected then raise notice 'ok  %', label; else raise notice 'FAIL % (got %, wanted %)', label, actual, expected; end if; end $$;
create or replace function pg_temp.as_(uid text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', uid, 'aal', aal)::text, false); end $$;
create or replace function pg_temp.rejects(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was accepted)', label; exception when others then raise notice 'ok  % (refused)', label; end; end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000ad01','admin@shop.test'),('00000000-0000-0000-0000-0000000000c1','cust@shop.test');
insert into public.profiles (id, role) values ('00000000-0000-0000-0000-00000000ad01','admin'),('00000000-0000-0000-0000-0000000000c1','customer')
  on conflict (id) do update set role = excluded.role;

\echo --- who may use the screen
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal2');
select pg_temp.rejects('a customer cannot read the shipping data', $q$select public.shipping_admin_snapshot()$q$);
select pg_temp.rejects('a customer cannot change a fee', $q$select public.shipping_save_zone(null,'Sneaky',100,true,0)$q$);
select pg_temp.as_('00000000-0000-0000-0000-00000000ad01','aal1');
select pg_temp.rejects('an admin WITHOUT two-factor cannot read or change it', $q$select public.shipping_admin_snapshot()$q$);
select pg_temp.as_('00000000-0000-0000-0000-00000000ad01','aal2');

\echo --- the admin screen reads everything
select pg_temp.expect('the admin sees all 20 local governments', (select jsonb_array_length(public.shipping_admin_snapshot()->'lgas'))::text, '20');
select pg_temp.expect('the admin sees the Inter-state zone', (select count(*)::text from jsonb_array_elements(public.shipping_admin_snapshot()->'zones') z where z->>'kind' = 'interstate'), '1');

\echo --- zones
select pg_temp.expect('the Yaba fee can be changed (2000 to 2500)', (select fee_ngn::text from public.shipping_zones where name='Yaba') , '2000');
select public.shipping_save_zone((select id from public.shipping_zones where name='Yaba'), 'Yaba', 2500, true, 2);
select pg_temp.expect('the Yaba fee is now 2500', (select fee_ngn::text from public.shipping_zones where name='Yaba'), '2500');
select pg_temp.expect('the change is in the audit log', (select count(*)::text from public.audit_log where action='shipping_zone_saved' and meta->>'name'='Yaba' and meta->>'fee'='2500'), '1');
select pg_temp.rejects('a zone still used by areas cannot be switched off', $q$select public.shipping_save_zone((select id from public.shipping_zones where name='Yaba'),'Yaba',2500,false,2)$q$);
select pg_temp.rejects('the Inter-state zone cannot be switched off', $q$select public.shipping_save_zone((select id from public.shipping_zones where kind='interstate'),'Inter-state',null,false,9)$q$);
select pg_temp.rejects('a fee below zero is refused', $q$select public.shipping_save_zone(null,'Negative',-1,true,5)$q$);
select pg_temp.rejects('a zone name that is already used is refused', $q$select public.shipping_save_zone(null,'yaba',100,true,5)$q$);
select public.shipping_save_zone(null, 'Test Zone', null, true, 50);
select pg_temp.expect('a new zone can be added with no fee yet', (select (fee_ngn is null)::text from public.shipping_zones where name='Test Zone'), 'true');
select public.shipping_save_lga('Epe', (select id from public.shipping_zones where name='Test Zone'));
select pg_temp.expect('Epe now uses the new zone', (select z.name from public.shipping_lgas l join public.shipping_zones z on z.id=l.zone_id where l.name='Epe'), 'Test Zone');
select pg_temp.rejects('a zone that covers Epe cannot be switched off', $q$select public.shipping_save_zone((select id from public.shipping_zones where name='Test Zone'),'Test Zone',null,false,50)$q$);
select public.shipping_save_lga('Epe', (select id from public.shipping_zones where name='Lagos Mainland'));
select public.shipping_save_zone((select id from public.shipping_zones where name='Test Zone'),'Test Zone',null,false,50);
select pg_temp.expect('once empty, the zone can be switched off', (select active::text from public.shipping_zones where name='Test Zone'), 'false');
select pg_temp.rejects('a local government cannot be moved to a switched-off zone', $q$select public.shipping_save_lga('Ojo', (select id from public.shipping_zones where name='Test Zone'))$q$);
select pg_temp.rejects('an unknown local government is refused', $q$select public.shipping_save_lga('Nowhere', (select id from public.shipping_zones where name='Yaba'))$q$);

\echo --- areas
select pg_temp.rejects('an area with more than 5 other names is refused', $q$select public.shipping_save_area(null,'Ojo','Test Area',array['a1','a2','a3','a4','a5','a6'],null,null,true)$q$);
select pg_temp.rejects('an area name too short is refused', $q$select public.shipping_save_area(null,'Ojo','X',null,null,null,true)$q$);
select pg_temp.rejects('a second Imude under Ojo is refused', $q$select public.shipping_save_area(null,'Ojo','Imude',null,null,null,true)$q$);
select public.shipping_save_area(null,'Ojo','Test Area',array['Testy'],null,3000,true);
select pg_temp.expect('a new area with its own fee is saved', (select fee_ngn::text from public.shipping_areas where name='Test Area'), '3000');
select public.shipping_delete_area((select id from public.shipping_areas where name='Test Area'));
select pg_temp.expect('the area can be deleted', (select count(*)::text from public.shipping_areas where name='Test Area'), '0');
select pg_temp.rejects('an area cannot use a switched-off zone', $q$select public.shipping_save_area(null,'Ojo','Ghost Area',null,(select id from public.shipping_zones where name='Test Zone'),null,true)$q$);

\echo --- inter-state cities
select public.shipping_save_city(null,'FCT - Abuja','Abuja',null,true);
select pg_temp.expect('an Abuja city rate can be added with no fee yet', (select (fee_ngn is null)::text from public.shipping_interstate_cities where city='Abuja'), 'true');
select pg_temp.rejects('a state that is not on the list is refused', $q$select public.shipping_save_city(null,'Narnia','Aslan',1000,true)$q$);
select pg_temp.rejects('Lagos cannot be priced by city', $q$select public.shipping_save_city(null,'Lagos','Ikeja',1000,true)$q$);
select public.shipping_delete_city((select id from public.shipping_interstate_cities where city='Abuja'));
select pg_temp.expect('the city rate can be deleted', (select count(*)::text from public.shipping_interstate_cities where city='Abuja'), '0');
