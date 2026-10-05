-- Run AFTER 006.
-- 1) Editable store settings (fees, contact details, spa menu ...) saved ONLY through save_setting(), which re-checks admin + two-factor.
-- 2) Hide internal columns (who edited what, who wrote a review) from the public.
-- 3) The server-side login lockout: 5 wrong passwords -> 15 min, next 5 -> 30 min, next 5 -> 60 min, doubling each time.
--    All the numbers live in security_config (not in code) and can be changed by an admin.

-- ---------- 1) settings ----------
alter table public.settings
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id);
alter table public.settings drop constraint if exists settings_key_ok;
alter table public.settings add constraint settings_key_ok check (key in ('store','delivery','ceo','spa','faq','about'));
alter table public.settings drop constraint if exists settings_value_ok;
alter table public.settings add constraint settings_value_ok check (jsonb_typeof(value) = 'object' and octet_length(value::text) <= 100000);

create or replace function public.save_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key is null or p_key not in ('store','delivery','ceo','spa','faq','about') then raise exception 'unknown setting'; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then raise exception 'bad value'; end if;
  if octet_length(p_value::text) > 100000 then raise exception 'too large'; end if;
  insert into public.settings (key, value, updated_at, updated_by) values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'save_setting', 'settings', p_key, jsonb_build_object('bytes', octet_length(p_value::text)));
end $$;
revoke execute on function public.save_setting(text, jsonb) from public, anon;
grant  execute on function public.save_setting(text, jsonb) to authenticated;      -- re-checks is_admin() inside

-- ---------- 2) hide internal columns from the public ----------
revoke select on public.settings from anon, authenticated;
grant  select (key, value, updated_at) on public.settings to anon, authenticated;
revoke select on public.pages from anon, authenticated;
grant  select (slug, title, body, updated_at) on public.pages to anon, authenticated;
revoke select on public.reviews from anon, authenticated;
grant  select (id, product_id, name, rating, body, status, created_at) on public.reviews to anon, authenticated;

-- ---------- 3) login lockout ----------
create table if not exists public.security_config (
  key text primary key,
  value integer not null check (value between 1 and 1000000)
);
insert into public.security_config (key, value) values
  ('login_max_failures', 5),          -- wrong passwords before a lock
  ('login_base_lock_minutes', 15),    -- first lock
  ('login_lock_multiplier', 2),       -- each next lock is this many times longer (15, 30, 60, 120 ...)
  ('login_max_lock_minutes', 1440),   -- a lock never exceeds this (24 hours), so nobody is locked out for days
  ('login_reset_after_hours', 24)     -- after this long with no failures the count starts again from the first lock
on conflict (key) do nothing;
alter table public.security_config enable row level security;      -- no policies, no grants: reachable only through the functions below

create table if not exists public.login_locks (
  subject text primary key,                       -- 'e:<sha256 of email>' or 'i:<ip address>'
  failures integer not null default 0,            -- wrong attempts since the last lock
  level integer not null default 0,               -- how many locks in a row (drives the doubling)
  locked_until timestamptz,
  last_failure_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists login_locks_last_failure_idx on public.login_locks (last_failure_at);
alter table public.login_locks enable row level security;

create or replace function public._cfg(p_key text, p_default integer) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.security_config where key = p_key), p_default)
$$;

-- Is any of these subjects locked right now? Returns the unlock time, or null.
create or replace function public.login_check(p_subjects text[], p_now timestamptz default now()) returns timestamptz
language sql security definer set search_path = public as $$
  select max(locked_until) from public.login_locks where subject = any (p_subjects) and locked_until > p_now
$$;

-- Record one wrong password. Returns the unlock time if this attempt caused (or there already is) a lock, else null.
create or replace function public.login_failure(p_subjects text[], p_now timestamptz default now()) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  s text; r public.login_locks; result timestamptz := null; mins numeric; quiet_since timestamptz;
  v_max integer := public._cfg('login_max_failures', 5);
  v_base integer := public._cfg('login_base_lock_minutes', 15);
  v_mult integer := public._cfg('login_lock_multiplier', 2);
  v_cap  integer := public._cfg('login_max_lock_minutes', 1440);
  v_rst  integer := public._cfg('login_reset_after_hours', 24);
begin
  foreach s in array p_subjects loop
    insert into public.login_locks (subject, updated_at) values (s, p_now) on conflict (subject) do nothing;
    select * into r from public.login_locks where subject = s for update;

    if r.locked_until is not null and r.locked_until > p_now then          -- already locked: nothing to add
      result := greatest(result, r.locked_until);
      continue;
    end if;
    -- a long quiet period wipes the slate
    quiet_since := greatest(coalesce(r.locked_until, '-infinity'::timestamptz), coalesce(r.last_failure_at, '-infinity'::timestamptz));
    if quiet_since > '-infinity'::timestamptz and quiet_since < p_now - make_interval(hours => v_rst) then
      r.failures := 0; r.level := 0; r.locked_until := null;
    end if;

    r.failures := r.failures + 1;
    r.last_failure_at := p_now;
    if r.failures >= v_max then
      r.level := r.level + 1;
      mins := least(v_base * power(v_mult::numeric, (r.level - 1)::numeric), v_cap::numeric);
      r.locked_until := p_now + make_interval(secs => ceil(mins * 60)::double precision);
      r.failures := 0;
      result := greatest(result, r.locked_until);
    end if;
    update public.login_locks set failures = r.failures, level = r.level, locked_until = r.locked_until,
      last_failure_at = r.last_failure_at, updated_at = p_now where subject = s;
  end loop;

  if random() < 0.02 then      -- tidy: forget old, unlocked rows so random-email guessing cannot grow the table forever
    delete from public.login_locks where (locked_until is null or locked_until < p_now) and coalesce(last_failure_at, updated_at) < p_now - interval '30 days';
  end if;
  return result;
end $$;

-- A correct password: forget the failures for these subjects (the server passes only the email subject, never the IP).
create or replace function public.login_success(p_subjects text[]) returns void
language sql security definer set search_path = public as $$
  delete from public.login_locks where subject = any (p_subjects)
$$;

-- Admin-only: read and change the lockout numbers (validated, and written to the audit log).
create or replace function public.get_security_config() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.security_config);
end $$;

create or replace function public.save_security_config(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v integer; ok boolean;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'bad value'; end if;
  for k in select jsonb_object_keys(p) loop
    if jsonb_typeof(p -> k) <> 'number' or (p ->> k) !~ '^[0-9]{1,7}$' then raise exception 'bad number for %', k; end if;
    v := (p ->> k)::integer;
    ok := case k
      when 'login_max_failures'       then v between 3 and 20
      when 'login_base_lock_minutes'  then v between 1 and 1440
      when 'login_lock_multiplier'    then v between 1 and 10
      when 'login_max_lock_minutes'   then v between 1 and 43200
      when 'login_reset_after_hours'  then v between 1 and 720
      else false end;
    if not ok then raise exception 'out of range: %', k; end if;
    insert into public.security_config (key, value) values (k, v) on conflict (key) do update set value = excluded.value;
  end loop;
  if public._cfg('login_max_lock_minutes', 1440) < public._cfg('login_base_lock_minutes', 15) then raise exception 'the longest lock must not be shorter than the first lock'; end if;
  insert into public.audit_log (actor, action, entity, entity_id, meta) values (auth.uid(), 'save_security_config', 'security_config', null, p);
end $$;

-- ---------- who may run what ----------
revoke execute on function public._cfg(text, integer)                         from public, anon, authenticated, service_role;
revoke execute on function public.login_check(text[], timestamptz)            from public, anon, authenticated;
revoke execute on function public.login_failure(text[], timestamptz)          from public, anon, authenticated;
revoke execute on function public.login_success(text[])                       from public, anon, authenticated;
revoke execute on function public.get_security_config()                       from public, anon;
revoke execute on function public.save_security_config(jsonb)                 from public, anon;
grant  execute on function public.login_check(text[], timestamptz)            to service_role;
grant  execute on function public.login_failure(text[], timestamptz)          to service_role;
grant  execute on function public.login_success(text[])                       to service_role;
grant  execute on function public.get_security_config()                       to authenticated;     -- re-check is_admin() inside
grant  execute on function public.save_security_config(jsonb)                 to authenticated;
