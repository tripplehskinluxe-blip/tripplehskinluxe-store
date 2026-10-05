-- Run AFTER schema.sql. Adds review ratings on products, newsletter + contact tables,
-- and switches the catalogue to: no Makeup, Wellness -> "Spa & Wellness".

-- 1) Cached rating on each product (so product lists stay fast: no per-product review queries)
alter table public.products
  add column if not exists rating_avg numeric(2,1) not null default 0,
  add column if not exists review_count integer not null default 0;

create or replace function public.refresh_product_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    rating_avg  = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where product_id = pid and status = 'published'), 0),
    review_count = (select count(*) from public.reviews where product_id = pid and status = 'published')
  where p.id = pid;
  return null;
end $$;
drop trigger if exists reviews_rating_refresh on public.reviews;
create trigger reviews_rating_refresh after insert or update or delete on public.reviews
  for each row execute function public.refresh_product_rating();

-- 2) Newsletter + contact form (written by the server only; no public policies)
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) <= 254),
  created_at timestamptz not null default now()
);
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text, email text, phone text,
  message text not null check (char_length(message) <= 3000),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.newsletter_subscribers enable row level security;
alter table public.contact_messages enable row level security;
create policy newsletter_admin_read on public.newsletter_subscribers for select using (public.is_admin());
create policy contact_staff_read    on public.contact_messages        for select using (public.is_staff());
create policy contact_staff_update  on public.contact_messages        for update using (public.is_staff()) with check (public.is_staff());

-- 3) Catalogue changes: remove Makeup, rename Wellness
update public.products set is_active = false
  where category_id in (select id from public.categories where name = 'Makeup');
delete from public.categories c
  where c.name = 'Makeup' and not exists (select 1 from public.products p where p.category_id = c.id);
update public.categories set name = 'Spa & Wellness', slug = 'spa-wellness', description = 'Massage oils, bath soaks and wellness rituals.'
  where name = 'Wellness';
