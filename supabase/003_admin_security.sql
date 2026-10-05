-- Run AFTER schema.sql and 002. Staff/admin powers now require a two-factor (aal2) session.
-- Even if someone steals an admin password, the database refuses staff actions until the 6-digit code is verified.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.profiles where id = auth.uid() and role in ('staff','admin'))
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
