-- Team management rules. Every check prints "ok ..." or "FAIL ...".
\pset tuples_only on
create or replace function pg_temp.expect(label text, actual text, expected text) returns void language plpgsql as $$
begin if actual is not distinct from expected then raise notice 'ok  %', label; else raise notice 'FAIL % (got %, wanted %)', label, actual, expected; end if; end $$;
create or replace function pg_temp.as_(uid text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',uid,'aal',aal)::text, false); end $$;
create or replace function pg_temp.rejects(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was accepted)', label; exception when others then raise notice 'ok  % (%)', label, sqlerrm; end; end $$;
create or replace function pg_temp.denied(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was allowed)', label; exception when insufficient_privilege then raise notice 'ok  % (permission denied)', label; when others then raise notice 'FAIL % (wrong error: %)', label, sqlerrm; end; end $$;
create or replace function pg_temp.role_of(u text) returns text language sql as $$ select role from public.profiles where id = u::uuid $$;

insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-0000000000a1','boss@shop.com'),('00000000-0000-0000-0000-0000000000a2','coowner@shop.com'),
 ('00000000-0000-0000-0000-0000000000b1','till1@shop.com'),('00000000-0000-0000-0000-0000000000b2','till2@shop.com'),
 ('00000000-0000-0000-0000-0000000000c1','cust1@x'),('00000000-0000-0000-0000-0000000000c2','newhire@shop.com');
update public.profiles set role='admin' where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2');
update public.profiles set role='staff' where id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2');

\echo --- who may use the team functions
set role anon;
select pg_temp.denied('anon cannot call team_list', 'select * from public.team_list()');
select pg_temp.denied('anon cannot call team_set_role', $q$select public.team_set_role('00000000-0000-0000-0000-0000000000c2','customer','staff')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal2'); set role authenticated;
select pg_temp.rejects('customer cannot list the team', 'select * from public.team_list()');
select pg_temp.rejects('customer cannot promote anyone', $q$select public.team_set_role('00000000-0000-0000-0000-0000000000c2','customer','staff')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.rejects('STAFF cannot list the team', 'select * from public.team_list()');
select pg_temp.rejects('STAFF cannot promote anyone (cannot add their friend)', $q$select public.team_set_role('00000000-0000-0000-0000-0000000000c2','customer','staff')$q$);
select pg_temp.rejects('STAFF cannot reset anyones password', $q$select public.team_check_target('00000000-0000-0000-0000-0000000000b2','staff','reset_password')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal1'); set role authenticated;
select pg_temp.rejects('admin WITHOUT two-factor cannot list the team', 'select * from public.team_list()');
select pg_temp.rejects('admin WITHOUT two-factor cannot promote', $q$select public.team_set_role('00000000-0000-0000-0000-0000000000c2','customer','staff')$q$);
reset role;

\echo --- admin with two-factor
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select pg_temp.expect('team list shows admins first, then staff, with emails', (select string_agg(email || ':' || role, ' | ' order by ord) from (select email, role, row_number() over () ord from public.team_list()) t), 'boss@shop.com:admin | coowner@shop.com:admin | till1@shop.com:staff | till2@shop.com:staff');
select pg_temp.expect('customers are NOT in the team list', (select count(*)::text from public.team_list() where email = 'cust1@x'), '0');

select public.team_set_role('00000000-0000-0000-0000-0000000000c2','customer','staff');
select pg_temp.expect('a new hire can be made staff', pg_temp.role_of('00000000-0000-0000-0000-0000000000c2'), 'staff');
select public.team_set_role('00000000-0000-0000-0000-0000000000c2','staff','customer');
select pg_temp.expect('and removed again', pg_temp.role_of('00000000-0000-0000-0000-0000000000c2'), 'customer');

\echo --- what is IMPOSSIBLE from the website, even for an admin
select pg_temp.rejects('cannot make a customer an ADMIN', $q$select public.team_set_role('00000000-0000-0000-0000-0000000000c2','customer','admin')$q$);
select pg_temp.rejects('cannot make staff an ADMIN', $q$select public.team_set_role('00000000-0000-0000-0000-0000000000b1','staff','admin')$q$);
select pg_temp.rejects('cannot demote another ADMIN', $q$select public.team_set_role('00000000-0000-0000-0000-0000000000a2','admin','customer')$q$);
select pg_temp.rejects('cannot demote an admin by claiming they are staff', $q$select public.team_set_role('00000000-0000-0000-0000-0000000000a2','staff','customer')$q$);
select pg_temp.rejects('cannot touch your own account', $q$select public.team_set_role('00000000-0000-0000-0000-0000000000a1','admin','customer')$q$);
select pg_temp.rejects('a wrong "from" role is refused (customer is not staff)', $q$select public.team_set_role('00000000-0000-0000-0000-0000000000c1','staff','customer')$q$);
select pg_temp.rejects('unknown user is refused', $q$select public.team_set_role('99999999-9999-9999-9999-999999999999','customer','staff')$q$);
select pg_temp.rejects('null user is refused', $q$select public.team_set_role(null,'customer','staff')$q$);
select pg_temp.rejects('any other role name is refused', $q$select public.team_set_role('00000000-0000-0000-0000-0000000000c2','customer','owner')$q$);
reset role;
select pg_temp.expect('the other admin is still an admin after all those attempts', pg_temp.role_of('00000000-0000-0000-0000-0000000000a2'), 'admin');
select pg_temp.expect('nobody became admin: still exactly 2 admins', (select count(*)::text from public.profiles where role='admin'), '2');

\echo --- checks before the server resets a staff password / authenticator
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select public.team_check_target('00000000-0000-0000-0000-0000000000b1','staff','reset_password');
select public.team_check_target('00000000-0000-0000-0000-0000000000b1','staff','reset_mfa');
select pg_temp.rejects('cannot reset ANOTHER ADMINs password', $q$select public.team_check_target('00000000-0000-0000-0000-0000000000a2','staff','reset_password')$q$);
select pg_temp.rejects('cannot reset an admin even by asking for role "admin"', $q$select public.team_check_target('00000000-0000-0000-0000-0000000000a2','admin','reset_password')$q$);
select pg_temp.rejects('cannot reset your own password this way', $q$select public.team_check_target('00000000-0000-0000-0000-0000000000a1','staff','reset_password')$q$);
select pg_temp.rejects('cannot reset a customer', $q$select public.team_check_target('00000000-0000-0000-0000-0000000000c1','staff','reset_password')$q$);
select pg_temp.rejects('unknown action refused (no log forging)', $q$select public.team_check_target('00000000-0000-0000-0000-0000000000b1','staff','anything; drop table x')$q$);
reset role;
select pg_temp.expect('every allowed action is in the audit log (2 role changes + 2 checks)', (select count(*)::text from public.audit_log where action in ('team_set_role','team_reset_password','team_reset_mfa')), '4');
select pg_temp.expect('the log records who did it', (select count(*)::text from public.audit_log where actor = '00000000-0000-0000-0000-0000000000a1' and action like 'team_%'), '4');
