-- Login lockout (simulated clock) + settings. Every check prints "ok ..." or "FAIL ...".
\pset tuples_only on
create or replace function pg_temp.expect(label text, actual text, expected text) returns void language plpgsql as $$
begin if actual is not distinct from expected then raise notice 'ok  %', label; else raise notice 'FAIL % (got %, wanted %)', label, actual, expected; end if; end $$;
create or replace function pg_temp.as_(uid text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',uid,'aal',aal)::text, false); end $$;
create or replace function pg_temp.denied(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was allowed)', label; exception when insufficient_privilege then raise notice 'ok  % (permission denied)', label; when others then raise notice 'FAIL % (wrong error: %)', label, sqlerrm; end; end $$;
create or replace function pg_temp.rejects(label text, sql text) returns void language plpgsql as $$
begin begin execute sql; raise notice 'FAIL % (was accepted)', label; exception when others then raise notice 'ok  % (%)', label, sqlerrm; end; end $$;
-- minutes between a lock time and a moment (null-safe)
create or replace function pg_temp.mins(lock timestamptz, t timestamptz) returns text language sql as $$ select case when lock is null then 'none' else round(extract(epoch from (lock - t)) / 60)::text end $$;
-- n wrong passwords one second apart starting at t; returns the unlock time produced by the last one
create or replace function pg_temp.fail_n(subj text[], n int, t timestamptz) returns timestamptz language plpgsql as $$
declare r timestamptz; i int; begin for i in 1..n loop r := public.login_failure(subj, t + make_interval(secs => i)); end loop; return r; end $$;

insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','a@x'),('00000000-0000-0000-0000-0000000000b1','s@x'),('00000000-0000-0000-0000-0000000000c1','c@x');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='staff' where id='00000000-0000-0000-0000-0000000000b1';

\echo --- ESCALATING LOCKOUT (clock is simulated)
set role service_role;
select set_config('t.t0', '2026-01-01 00:00:00+00', false);
select pg_temp.expect('4 wrong passwords: not locked yet', pg_temp.mins(pg_temp.fail_n(array['e:a'], 4, current_setting('t.t0')::timestamptz), current_setting('t.t0')::timestamptz), 'none');
select pg_temp.expect('5th wrong password: locked for 15 minutes', pg_temp.mins(public.login_failure(array['e:a'], current_setting('t.t0')::timestamptz + interval '5 seconds'), current_setting('t.t0')::timestamptz + interval '5 seconds'), '15');
select pg_temp.expect('14 minutes later: still locked (a CORRECT password would be refused too)', (public.login_check(array['e:a'], current_setting('t.t0')::timestamptz + interval '14 minutes') is not null)::text, 'true');
select pg_temp.expect('after 15 minutes: unlocked', (public.login_check(array['e:a'], current_setting('t.t0')::timestamptz + interval '15 minutes 6 seconds') is null)::text, 'true');
select set_config('t.t1', '2026-01-01 00:16:00+00', false);
select pg_temp.expect('4 more wrong after unlocking: not locked', pg_temp.mins(pg_temp.fail_n(array['e:a'], 4, current_setting('t.t1')::timestamptz), current_setting('t.t1')::timestamptz), 'none');
select pg_temp.expect('5 more wrong: locked for 30 minutes (doubled)', pg_temp.mins(public.login_failure(array['e:a'], current_setting('t.t1')::timestamptz + interval '5 seconds'), current_setting('t.t1')::timestamptz + interval '5 seconds'), '30');
select set_config('t.t2', '2026-01-01 00:50:00+00', false);
select pg_temp.fail_n(array['e:a'], 4, current_setting('t.t2')::timestamptz);
select pg_temp.expect('5 more wrong: locked for 60 minutes', pg_temp.mins(public.login_failure(array['e:a'], current_setting('t.t2')::timestamptz + interval '5 seconds'), current_setting('t.t2')::timestamptz + interval '5 seconds'), '60');
select set_config('t.t3', '2026-01-01 02:00:00+00', false);
select pg_temp.fail_n(array['e:a'], 4, current_setting('t.t3')::timestamptz);
select pg_temp.expect('next: 120 minutes', pg_temp.mins(public.login_failure(array['e:a'], current_setting('t.t3')::timestamptz + interval '5 seconds'), current_setting('t.t3')::timestamptz + interval '5 seconds'), '120');
select pg_temp.expect('an extra wrong attempt DURING a lock does not extend it', pg_temp.mins(public.login_failure(array['e:a'], current_setting('t.t3')::timestamptz + interval '1 hour'), current_setting('t.t3')::timestamptz + interval '5 seconds'), '120');

\echo --- cap, isolation, reset
select set_config('t.t4', '2026-01-03 00:00:00+00', false);
select pg_temp.fail_n(array['e:cap'], 4, current_setting('t.t4')::timestamptz);
select public.login_failure(array['e:cap'], current_setting('t.t4')::timestamptz + interval '5 seconds');                                  -- lock 1: 15
select pg_temp.fail_n(array['e:cap'], 4, current_setting('t.t4')::timestamptz + interval '1 hour');
select public.login_failure(array['e:cap'], current_setting('t.t4')::timestamptz + interval '1 hour 5 seconds');                          -- lock 2: 30
select pg_temp.fail_n(array['e:cap'], 4, current_setting('t.t4')::timestamptz + interval '3 hours');
select public.login_failure(array['e:cap'], current_setting('t.t4')::timestamptz + interval '3 hours 5 seconds');                          -- lock 3: 60
select pg_temp.fail_n(array['e:cap'], 4, current_setting('t.t4')::timestamptz + interval '6 hours');
select public.login_failure(array['e:cap'], current_setting('t.t4')::timestamptz + interval '6 hours 5 seconds');                          -- lock 4: 120
select pg_temp.fail_n(array['e:cap'], 4, current_setting('t.t4')::timestamptz + interval '10 hours');
select public.login_failure(array['e:cap'], current_setting('t.t4')::timestamptz + interval '10 hours 5 seconds');                         -- lock 5: 240
select pg_temp.fail_n(array['e:cap'], 4, current_setting('t.t4')::timestamptz + interval '15 hours');
select public.login_failure(array['e:cap'], current_setting('t.t4')::timestamptz + interval '15 hours 5 seconds');                         -- lock 6: 480
select pg_temp.fail_n(array['e:cap'], 4, current_setting('t.t4')::timestamptz + interval '24 hours');
select public.login_failure(array['e:cap'], current_setting('t.t4')::timestamptz + interval '24 hours 5 seconds');                         -- lock 7: 960
select pg_temp.fail_n(array['e:cap'], 4, current_setting('t.t4')::timestamptz + interval '45 hours');
select pg_temp.expect('locks keep doubling but never pass the cap (24 hours = 1440 min)', pg_temp.mins(public.login_failure(array['e:cap'], current_setting('t.t4')::timestamptz + interval '45 hours 5 seconds'), current_setting('t.t4')::timestamptz + interval '45 hours 5 seconds'), '1440');

select pg_temp.fail_n(array['e:b'], 3, '2026-02-01 00:00:00+00');
select pg_temp.expect('another account is unaffected by someone else''s failures', (public.login_check(array['e:b'], '2026-02-01 00:00:10+00') is null)::text, 'true');
select pg_temp.expect('wrong password on email + IP counts for BOTH, lock = the longer one', pg_temp.mins(pg_temp.fail_n(array['e:c','i:9.9.9.9'], 5, '2026-02-02 00:00:00+00'), '2026-02-02 00:00:05+00'), '15');
select pg_temp.expect('IP is locked too (guessing many emails from one place)', (public.login_check(array['i:9.9.9.9'], '2026-02-02 00:01:00+00') is not null)::text, 'true');
select public.login_success(array['e:c']);
select pg_temp.expect('a correct password clears that EMAIL lock', (public.login_check(array['e:c'], '2026-02-02 00:01:00+00') is null)::text, 'true');
select pg_temp.expect('...but not the IP lock', (public.login_check(array['i:9.9.9.9'], '2026-02-02 00:01:00+00') is not null)::text, 'true');

select pg_temp.fail_n(array['e:q'], 4, '2026-03-01 00:00:00+00'); select public.login_failure(array['e:q'], '2026-03-01 00:00:05+00');            -- lock 1 (15)
select pg_temp.fail_n(array['e:q'], 4, '2026-03-01 00:30:00+00'); select public.login_failure(array['e:q'], '2026-03-01 00:30:05+00');            -- lock 2 (30)
select pg_temp.fail_n(array['e:q'], 4, '2026-03-01 02:00:00+00');
select pg_temp.expect('after 24h+ of calm the count starts over (back to 15, not 60)', pg_temp.mins(pg_temp.fail_n(array['e:q'], 5, '2026-03-05 00:00:00+00'), '2026-03-05 00:00:05+00'), '15');

\echo --- who may call the lockout engine
reset role;
set role anon;
select pg_temp.denied('anon cannot call login_failure', $q$select public.login_failure(array['e:x'])$q$);
select pg_temp.denied('anon cannot read login_locks', 'select * from public.login_locks');
select pg_temp.denied('anon cannot read security_config', 'select * from public.security_config');
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal2'); set role authenticated;
select pg_temp.denied('customer cannot call login_check', $q$select public.login_check(array['e:x'])$q$);
select pg_temp.denied('customer cannot read login_locks', 'select * from public.login_locks');
select pg_temp.denied('customer cannot read security_config table', 'select * from public.security_config');
select pg_temp.rejects('customer cannot read the lockout settings', 'select public.get_security_config()');
select pg_temp.rejects('customer cannot change the lockout settings', $q$select public.save_security_config('{"login_max_failures": 99}')$q$);
reset role;

\echo --- lockout numbers are editable by an admin (with two-factor) only, and validated
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.rejects('staff cannot change lockout settings', $q$select public.save_security_config('{"login_max_failures": 3}')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal1'); set role authenticated;
select pg_temp.rejects('admin without 2FA cannot change lockout settings', $q$select public.save_security_config('{"login_max_failures": 3}')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select pg_temp.rejects('1 failure allowed is refused (too strict, would lock on a typo)', $q$select public.save_security_config('{"login_max_failures": 1}')$q$);
select pg_temp.rejects('text instead of a number is refused', $q$select public.save_security_config('{"login_max_failures": "3; drop table x"}')$q$);
select pg_temp.rejects('unknown key is refused', $q$select public.save_security_config('{"evil": 5}')$q$);
select pg_temp.rejects('longest lock shorter than first lock is refused', $q$select public.save_security_config('{"login_max_lock_minutes": 5}')$q$);
select public.save_security_config('{"login_max_failures": 3, "login_base_lock_minutes": 5}');
select pg_temp.expect('admin (2FA) can read the settings', (public.get_security_config() ->> 'login_max_failures'), '3');
reset role;
set role service_role;
select pg_temp.expect('new rule applies at once: 3 wrong -> 5 minute lock', pg_temp.mins(pg_temp.fail_n(array['e:new'], 3, '2026-04-01 00:00:00+00'), '2026-04-01 00:00:03+00'), '5');
reset role;
select pg_temp.expect('the change was written to the audit log', (select count(*)::text from public.audit_log where action='save_security_config'), '1');

\echo --- SETTINGS: save only through save_setting()
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal2'); set role authenticated;
select pg_temp.rejects('customer cannot save settings', $q$select public.save_setting('delivery','{"lagosFee": 1}')$q$);
select pg_temp.denied('customer cannot write settings directly', $q$insert into public.settings(key,value) values ('delivery','{"lagosFee":1}')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000b1','aal2'); set role authenticated;
select pg_temp.rejects('staff cannot save settings', $q$select public.save_setting('delivery','{"lagosFee": 1}')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal1'); set role authenticated;
select pg_temp.rejects('admin without 2FA cannot save settings', $q$select public.save_setting('delivery','{"lagosFee": 1}')$q$);
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000a1','aal2'); set role authenticated;
select public.save_setting('delivery','{"lagosFee": 2500, "otherFee": 5000}');
select pg_temp.rejects('unknown setting name refused', $q$select public.save_setting('passwords','{"a":1}')$q$);
select pg_temp.rejects('non-object value refused', $q$select public.save_setting('delivery','[1,2]')$q$);
select pg_temp.rejects('oversized value refused', $q$select public.save_setting('faq', jsonb_build_object('x', repeat('a', 120000)))$q$);
reset role;
select pg_temp.expect('admin (2FA) saved the delivery fee', (select value ->> 'lagosFee' from public.settings where key='delivery'), '2500');
select pg_temp.expect('the change was written to the audit log', (select count(*)::text from public.audit_log where action='save_setting'), '1');
set role anon;
select pg_temp.expect('anon (the public shop) can read settings', (select value ->> 'lagosFee' from public.settings where key='delivery'), '2500');
select pg_temp.denied('anon cannot see who edited a setting', 'select updated_by from public.settings');
select pg_temp.denied('anon cannot SELECT * (internal columns stay private)', 'select * from public.settings');
select pg_temp.denied('anon cannot see who wrote a review', 'select user_id from public.reviews');
select pg_temp.denied('anon cannot see who edited a legal page', 'select updated_by from public.pages');
reset role;
select pg_temp.as_('00000000-0000-0000-0000-0000000000c1','aal1'); set role authenticated;
select pg_temp.denied('signed-in customer cannot see who wrote a review either', 'select user_id from public.reviews');
reset role;
