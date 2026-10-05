-- =====================================================================
-- Tripple H Skin Luxe — database schema for Supabase (Postgres)
-- Run the whole file once in: Supabase dashboard → SQL Editor.
-- Security model: row-level security (RLS) ON for every table. The public website can only
-- READ the catalogue. Orders, stock and payments are written by server code / SECURITY DEFINER
-- functions only. Prices are always read from the database, never trusted from the browser.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- people & roles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer','staff','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- every new signup is a plain customer. Roles are only ever granted by an admin in SQL.
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('staff','admin'))
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- ---------- catalogue ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  sort int not null default 0
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  slug text not null unique,
  name text not null,
  brand text not null,
  category_id uuid references public.categories(id),
  subcategory text,
  price_ngn integer not null check (price_ngn >= 0),
  old_price_ngn integer check (old_price_ngn is null or old_price_ngn > price_ngn),
  stock integer not null default 0 check (stock >= 0),
  low_stock_at integer not null default 5,
  images text[] not null default '{}',
  short_description text,
  description text,
  ingredients text,
  how_to_use text,
  tags text[] not null default '{}',
  concerns text[] not null default '{}',
  skin_type text,
  is_new boolean not null default false,
  is_best_seller boolean not null default false,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_brand_idx on public.products (brand);
create index products_active_idx on public.products (is_active);

-- ---------- customers & orders ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  name text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);
create unique index customers_phone_key on public.customers (phone) where phone is not null;

create sequence public.order_seq start 1048;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  channel text not null check (channel in ('online','store')),          -- online vs physical store
  status text not null default 'pending'
    check (status in ('pending','processing','packed','shipped','out_for_delivery','delivered','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','failed','refunded')),
  payment_method text not null check (payment_method in ('paystack','bank_transfer','pay_on_delivery','cash','pos_terminal')),
  paystack_reference text unique,
  customer_id uuid references public.customers(id),
  user_id uuid references auth.users(id),
  customer_name text,
  customer_email text,
  customer_phone text,
  address jsonb,
  subtotal_ngn integer not null check (subtotal_ngn >= 0),
  delivery_ngn integer not null default 0 check (delivery_ngn >= 0),
  discount_ngn integer not null default 0 check (discount_ngn >= 0),
  discount_code text,
  total_ngn integer not null check (total_ngn >= 0),
  needs_attention boolean not null default false,                        -- e.g. paid but item sold out
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index orders_created_idx on public.orders (created_at desc);
create index orders_channel_idx on public.orders (channel);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  name text not null,
  unit_price_ngn integer not null,
  qty integer not null check (qty > 0)
);
create index order_items_order_idx on public.order_items (order_id);

-- every stock change is logged (small, append-only; keeps inventory auditable without heavy queries)
create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id),
  delta integer not null,
  reason text not null check (reason in ('order','pos','import','adjustment','cancel')),
  order_id uuid references public.orders(id),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('percent','fixed')),
  value integer not null check (value > 0),
  min_order_ngn integer not null default 0,
  active boolean not null default true,
  uses integer not null default 0,
  check (type <> 'percent' or value <= 100)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid references auth.users(id),
  name text not null,
  rating integer not null check (rating between 1 and 5),
  body text not null check (char_length(body) <= 2000),
  status text not null default 'pending' check (status in ('pending','published','hidden')),
  created_at timestamptz not null default now()
);
create index reviews_product_idx on public.reviews (product_id, status);

create table public.settings (key text primary key, value jsonb not null);   -- NEVER store secrets here (publicly readable)
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid, action text not null, entity text, entity_id text, meta jsonb,
  created_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('delivery', '{"lagosFee":2000,"otherFee":4500,"freeThreshold":50000}'),
  ('store', '{"name":"Tripple H Skin Luxe","instagram":"https://www.instagram.com/tripplehskinluxe"}')
on conflict do nothing;
insert into public.discounts (code, type, value, min_order_ngn) values
  ('WELCOME10','percent',10,0), ('SAVE5000','fixed',5000,50000)
on conflict do nothing;

-- =====================================================================
-- Functions (all stock/money changes go through these, inside one transaction)
-- =====================================================================
create or replace function public.next_order_number(p_channel text) returns text
language sql as $$
  select (case when p_channel = 'store' then 'STR-' else 'ONL-' end) || to_char(now(),'YYYY') || '-' || nextval('public.order_seq')
$$;

-- Creates an unpaid online order. Re-reads prices from the database and refuses if anything differs.
create or replace function public.create_online_order(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_sub integer; v_id uuid; v_num text; v_cust uuid;
begin
  with q as (select (e->>'product_id')::uuid pid, sum((e->>'qty')::int) qty
             from jsonb_array_elements(p->'items') e group by 1)
  select coalesce(sum(pr.price_ngn * q.qty), 0) into v_sub
  from q join public.products pr on pr.id = q.pid where pr.is_active and pr.stock >= q.qty;

  if v_sub = 0 or v_sub <> (p->>'subtotal')::int then raise exception 'price_or_stock_mismatch'; end if;
  if (p->>'total')::int <> v_sub + (p->>'delivery')::int - (p->>'discount')::int then raise exception 'total_mismatch'; end if;

  insert into public.customers (name, email, phone)
  values (p->>'name', p->>'email', p->>'phone')
  on conflict (phone) where phone is not null do update set name = excluded.name, email = excluded.email
  returning id into v_cust;

  v_num := public.next_order_number('online');
  insert into public.orders (order_number, channel, payment_method, paystack_reference, customer_id,
    customer_name, customer_email, customer_phone, address, subtotal_ngn, delivery_ngn, discount_ngn, discount_code, total_ngn)
  values (v_num, 'online', 'paystack', p->>'reference', v_cust, p->>'name', p->>'email', p->>'phone', p->'address',
    v_sub, (p->>'delivery')::int, (p->>'discount')::int, nullif(p->>'discount_code',''), (p->>'total')::int)
  returning id into v_id;

  with q as (select (e->>'product_id')::uuid pid, sum((e->>'qty')::int) qty
             from jsonb_array_elements(p->'items') e group by 1)
  insert into public.order_items (order_id, product_id, name, unit_price_ngn, qty)
  select v_id, pr.id, pr.name, pr.price_ngn, q.qty from q join public.products pr on pr.id = q.pid;

  return v_num;
end $$;

-- Called ONLY by the webhook (service role) once Paystack has confirmed the payment.
-- Idempotent: safe if Paystack sends the same event twice.
create or replace function public.mark_order_paid(p_reference text, p_amount_kobo bigint) returns text
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where paystack_reference = p_reference for update;
  if not found then return 'not_found'; end if;
  if o.payment_status = 'paid' then return 'already_paid'; end if;

  if p_amount_kobo <> o.total_ngn::bigint * 100 then
    update public.orders set needs_attention = true where id = o.id;
    return 'amount_mismatch';
  end if;

  perform 1 from public.products where id in (select product_id from public.order_items where order_id = o.id) order by id for update;

  if exists (select 1 from public.order_items oi join public.products p on p.id = oi.product_id
             where oi.order_id = o.id and p.stock < oi.qty) then
    -- money received but an item sold out meanwhile: keep the payment, flag for a human (refund / substitute)
    update public.orders set payment_status = 'paid', paid_at = now(), needs_attention = true where id = o.id;
    return 'paid_stock_issue';
  end if;

  update public.products p set stock = p.stock - oi.qty, updated_at = now()
  from public.order_items oi where oi.order_id = o.id and oi.product_id = p.id;
  insert into public.stock_movements (product_id, delta, reason, order_id)
  select product_id, -qty, 'order', o.id from public.order_items where order_id = o.id;

  update public.orders set payment_status = 'paid', status = 'processing', paid_at = now() where id = o.id;
  if o.discount_code is not null then update public.discounts set uses = uses + 1 where code = o.discount_code; end if;
  return 'paid';
end $$;

-- Counter sale in the physical store (staff only). Same stock pool as the website.
create or replace function public.record_pos_sale(p_items jsonb, p_method text, p_name text default null, p_phone text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num text; v_total integer; v_cust uuid; r record;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_method not in ('cash','pos_terminal','bank_transfer') then raise exception 'bad payment method'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'no items'; end if;

  perform 1 from public.products
    where id in (select (e->>'product_id')::uuid from jsonb_array_elements(p_items) e) order by id for update;

  for r in select (e->>'product_id')::uuid pid, sum((e->>'qty')::int) qty from jsonb_array_elements(p_items) e group by 1 loop
    if r.qty is null or r.qty <= 0 then raise exception 'bad quantity'; end if;
    if not exists (select 1 from public.products where id = r.pid and is_active and stock >= r.qty) then
      raise exception 'insufficient stock';
    end if;
  end loop;

  with q as (select (e->>'product_id')::uuid pid, sum((e->>'qty')::int) qty from jsonb_array_elements(p_items) e group by 1)
  select sum(pr.price_ngn * q.qty) into v_total from q join public.products pr on pr.id = q.pid;

  if nullif(trim(coalesce(p_phone,'')),'') is not null then
    insert into public.customers (name, phone) values (nullif(trim(coalesce(p_name,'')),''), trim(p_phone))
    on conflict (phone) where phone is not null do update set name = coalesce(excluded.name, public.customers.name)
    returning id into v_cust;
  end if;

  v_num := public.next_order_number('store');
  insert into public.orders (order_number, channel, status, payment_status, payment_method, customer_id, customer_name, customer_phone,
    subtotal_ngn, total_ngn, created_by, paid_at)
  values (v_num, 'store', 'delivered', 'paid', p_method, v_cust, coalesce(nullif(trim(coalesce(p_name,'')),''), 'Walk-in customer'),
    nullif(trim(coalesce(p_phone,'')),''), v_total, v_total, auth.uid(), now())
  returning id into v_id;

  with q as (select (e->>'product_id')::uuid pid, sum((e->>'qty')::int) qty from jsonb_array_elements(p_items) e group by 1)
  insert into public.order_items (order_id, product_id, name, unit_price_ngn, qty)
  select v_id, pr.id, pr.name, pr.price_ngn, q.qty from q join public.products pr on pr.id = q.pid;

  update public.products p set stock = p.stock - oi.qty, updated_at = now()
  from public.order_items oi where oi.order_id = v_id and oi.product_id = p.id;
  insert into public.stock_movements (product_id, delta, reason, order_id, created_by)
  select product_id, -qty, 'pos', v_id, auth.uid() from public.order_items where order_id = v_id;

  return v_num;
end $$;

create or replace function public.adjust_stock(p_product uuid, p_delta integer, p_note text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare v_new integer;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.products set stock = stock + p_delta, updated_at = now()
  where id = p_product and stock + p_delta >= 0 returning stock into v_new;
  if not found then raise exception 'product not found or stock would go negative'; end if;
  insert into public.stock_movements (product_id, delta, reason, note, created_by) values (p_product, p_delta, 'adjustment', p_note, auth.uid());
  insert into public.audit_log (actor, action, entity, entity_id, meta) values (auth.uid(), 'adjust_stock', 'products', p_product::text, jsonb_build_object('delta', p_delta, 'note', p_note));
  return v_new;
end $$;

create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'cancelled' then return; end if;
  -- put stock back only if it was actually taken
  if exists (select 1 from public.stock_movements where order_id = o.id and reason in ('order','pos')) then
    update public.products p set stock = p.stock + oi.qty, updated_at = now()
    from public.order_items oi where oi.order_id = o.id and oi.product_id = p.id;
    insert into public.stock_movements (product_id, delta, reason, order_id, created_by)
    select product_id, qty, 'cancel', o.id, auth.uid() from public.order_items where order_id = o.id;
  end if;
  update public.orders set status = 'cancelled' where id = o.id;
  insert into public.audit_log (actor, action, entity, entity_id) values (auth.uid(), 'cancel_order', 'orders', o.id::text);
end $$;

create or replace function public.set_order_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('pending','processing','packed','shipped','out_for_delivery','delivered','cancelled') then raise exception 'bad status'; end if;
  if p_status = 'cancelled' then perform public.cancel_order(p_order); return; end if;
  update public.orders set status = p_status where id = p_order and status <> 'cancelled';
  insert into public.audit_log (actor, action, entity, entity_id, meta) values (auth.uid(), 'set_order_status', 'orders', p_order::text, jsonb_build_object('status', p_status));
end $$;

-- Who may run which function (functions are executable by everyone by default, so lock them down)
revoke execute on function public.next_order_number(text)           from public, anon, authenticated;
revoke execute on function public.create_online_order(jsonb)        from public, anon, authenticated;
revoke execute on function public.mark_order_paid(text, bigint)     from public, anon, authenticated;
grant  execute on function public.next_order_number(text)           to service_role;
grant  execute on function public.create_online_order(jsonb)        to service_role;
grant  execute on function public.mark_order_paid(text, bigint)     to service_role;

revoke execute on function public.record_pos_sale(jsonb, text, text, text) from public, anon;
revoke execute on function public.adjust_stock(uuid, integer, text)        from public, anon;
revoke execute on function public.cancel_order(uuid)                       from public, anon;
revoke execute on function public.set_order_status(uuid, text)             from public, anon;
grant  execute on function public.record_pos_sale(jsonb, text, text, text) to authenticated;   -- they re-check is_staff() inside
grant  execute on function public.adjust_stock(uuid, integer, text)        to authenticated;
grant  execute on function public.cancel_order(uuid)                       to authenticated;
grant  execute on function public.set_order_status(uuid, text)             to authenticated;

-- =====================================================================
-- Row-level security
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.customers       enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.stock_movements enable row level security;
alter table public.discounts       enable row level security;
alter table public.reviews         enable row level security;
alter table public.settings        enable row level security;
alter table public.audit_log       enable row level security;

-- profiles: you see/edit only yourself, and you can never change your own role
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
create policy profiles_admin_all on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- catalogue: public can read active products; only admins change them
create policy categories_read  on public.categories for select using (true);
create policy categories_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy products_read    on public.products for select using (is_active or public.is_staff());
create policy products_admin   on public.products for all using (public.is_admin()) with check (public.is_admin());

-- customers / orders: customers see their own; staff see all; NO direct inserts/updates (functions + server only)
create policy customers_select on public.customers for select using (user_id = auth.uid() or public.is_staff());
create policy orders_select    on public.orders    for select using (user_id = auth.uid() or public.is_staff());
create policy order_items_select on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));

create policy stock_movements_select on public.stock_movements for select using (public.is_staff());
create policy discounts_admin on public.discounts for all using (public.is_admin()) with check (public.is_admin());   -- codes are checked server-side, not readable by shoppers

create policy reviews_read   on public.reviews for select using (status = 'published' or public.is_staff());
create policy reviews_insert on public.reviews for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy reviews_admin  on public.reviews for all using (public.is_admin()) with check (public.is_admin());

create policy settings_read  on public.settings for select using (true);
create policy settings_admin on public.settings for all using (public.is_admin()) with check (public.is_admin());
create policy audit_admin    on public.audit_log for select using (public.is_admin());

-- To make yourself the first admin (after signing up through Supabase Auth), run once:
--   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'YOU@example.com');
