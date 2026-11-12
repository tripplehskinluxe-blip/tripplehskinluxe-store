-- Run AFTER 014. Subcategories inside each category, managed by an admin.
--   * a subcategory belongs to ONE category and can have an optional group heading (for example "Face" or "Body Care");
--   * everyone can read them (the shop needs them); only an admin (signed in with two-factor) can add, rename or remove them;
--   * a product keeps its subcategory as plain text (so CSV import and export work exactly as before);
--   * renaming a subcategory renames it on every product in that category; removing one never deletes a product, it only
--     clears the subcategory on the products that were in it.
-- Safe to run more than once.

create table if not exists public.subcategories (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name        text not null,
  group_name  text,
  slug        text not null,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint subcategories_name_ok  check (name = btrim(name) and char_length(name) between 1 and 60 and name !~ '[,()"\\*%<>]'),
  constraint subcategories_group_ok check (group_name is null or (group_name = btrim(group_name) and char_length(group_name) between 1 and 40 and group_name !~ '[,()"\\*%<>]')),
  constraint subcategories_slug_ok  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  constraint subcategories_sort_ok  check (sort between 0 and 999),
  unique (category_id, name),
  unique (category_id, slug)
);
create index if not exists subcategories_category_idx on public.subcategories (category_id, sort);

alter table public.subcategories enable row level security;
drop policy if exists subcategories_read  on public.subcategories;
drop policy if exists subcategories_admin on public.subcategories;
create policy subcategories_read  on public.subcategories for select to anon, authenticated using (true);
create policy subcategories_admin on public.subcategories for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.subcategories from public, anon, authenticated;
grant select on public.subcategories to anon, authenticated;
grant insert, update, delete on public.subcategories to authenticated;      -- the policy above still limits writing to admins

-- keep the products in step with a rename or a removal
create or replace function public.subcategories_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.category_id <> old.category_id then raise exception 'a subcategory cannot be moved to another category'; end if;
    if new.name <> old.name then
      update public.products set subcategory = new.name where category_id = old.category_id and subcategory = old.name;
    end if;
    return new;
  end if;
  update public.products set subcategory = null where category_id = old.category_id and subcategory = old.name;
  return old;
end $$;
revoke execute on function public.subcategories_sync() from public, anon, authenticated;
drop trigger if exists subcategories_sync_update on public.subcategories;
drop trigger if exists subcategories_sync_delete on public.subcategories;
create trigger subcategories_sync_update after update on public.subcategories for each row execute function public.subcategories_sync();
create trigger subcategories_sync_delete after delete on public.subcategories for each row execute function public.subcategories_sync();
