-- Run AFTER 004. Safe to run once.
-- 1) A payment that arrives for a CANCELLED order is kept and flagged (never revives the order or takes stock).
-- 2) Phone numbers are stored in one canonical format so the same customer is not duplicated.
-- 3) Unpaid Paystack orders cannot be moved forward by staff.
-- 4) Stock "set count" is applied under a row lock (no stale-number mistakes).
-- 5) Email bookkeeping (each email is sent once) and editable legal pages.

-- ---------- phone format ----------
-- Nigerian numbers become 0XXXXXXXXXX (11 digits): +234 801 234 5678, 2348012345678, 8012345678 and 08012345678 all match.
-- Anything else is kept as digits only.
create or replace function public.norm_phone(p text) returns text
language sql immutable as $$
  select case
    when d ~ '^234[0-9]{10}$' then '0' || substr(d, 4)
    when d ~ '^[789][01][0-9]{8}$' then '0' || d
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) s
$$;

-- ---------- email bookkeeping ----------
alter table public.orders
  add column if not exists confirmation_emailed_at timestamptz,
  add column if not exists last_notified_status text;

-- ---------- editable legal pages ----------
create table if not exists public.pages (
  slug text primary key check (slug in ('privacy', 'terms', 'returns')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 60000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.pages enable row level security;
drop policy if exists pages_read on public.pages;
drop policy if exists pages_admin on public.pages;
create policy pages_read  on public.pages for select using (true);                        -- legal text is public by design
create policy pages_admin on public.pages for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.touch_page() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
drop trigger if exists pages_touch on public.pages;
create trigger pages_touch before insert or update on public.pages for each row execute function public.touch_page();

-- ---------- online order creation: canonical phone ----------
create or replace function public.create_online_order(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_sub integer; v_id uuid; v_num text; v_cust uuid; v_phone text := nullif(public.norm_phone(p->>'phone'), '');
begin
  with q as (select (e->>'product_id')::uuid pid, sum((e->>'qty')::int) qty
             from jsonb_array_elements(p->'items') e group by 1)
  select coalesce(sum(pr.price_ngn * q.qty), 0) into v_sub
  from q join public.products pr on pr.id = q.pid where pr.is_active and pr.stock >= q.qty;

  if v_sub = 0 or v_sub <> (p->>'subtotal')::int then raise exception 'price_or_stock_mismatch'; end if;
  if (p->>'total')::int <> v_sub + (p->>'delivery')::int - (p->>'discount')::int then raise exception 'total_mismatch'; end if;

  if v_phone is not null then
    insert into public.customers (name, email, phone) values (p->>'name', p->>'email', v_phone)
    on conflict (phone) where phone is not null do update set name = excluded.name, email = excluded.email
    returning id into v_cust;
  else
    insert into public.customers (name, email) values (p->>'name', p->>'email') returning id into v_cust;
  end if;

  v_num := public.next_order_number('online');
  insert into public.orders (order_number, channel, payment_method, paystack_reference, customer_id,
    customer_name, customer_email, customer_phone, address, subtotal_ngn, delivery_ngn, discount_ngn, discount_code, total_ngn)
  values (v_num, 'online', 'paystack', p->>'reference', v_cust, p->>'name', p->>'email', v_phone, p->'address',
    v_sub, (p->>'delivery')::int, (p->>'discount')::int, nullif(p->>'discount_code',''), (p->>'total')::int)
  returning id into v_id;

  with q as (select (e->>'product_id')::uuid pid, sum((e->>'qty')::int) qty
             from jsonb_array_elements(p->'items') e group by 1)
  insert into public.order_items (order_id, product_id, name, unit_price_ngn, qty)
  select v_id, pr.id, pr.name, pr.price_ngn, q.qty from q join public.products pr on pr.id = q.pid;

  return v_num;
end $$;

-- ---------- marking an order paid ----------
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

  -- Money arrived for an order that was cancelled: keep the payment on record, flag it for a human (refund), never revive the order or touch stock.
  if o.status = 'cancelled' then
    update public.orders set payment_status = 'paid', paid_at = now(), needs_attention = true where id = o.id;
    insert into public.audit_log (actor, action, entity, entity_id, meta)
    values (null, 'paid_after_cancel', 'orders', o.id::text, jsonb_build_object('reference', p_reference));
    return 'paid_cancelled';
  end if;

  perform 1 from public.products where id in (select product_id from public.order_items where order_id = o.id) order by id for update;

  if exists (select 1 from public.order_items oi join public.products p on p.id = oi.product_id
             where oi.order_id = o.id and p.stock < oi.qty) then
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

-- ---------- POS sale: canonical phone ----------
create or replace function public.record_pos_sale(p_items jsonb, p_method text, p_name text default null, p_phone text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num text; v_total integer; v_cust uuid; r record; v_phone text := nullif(public.norm_phone(p_phone), '');
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

  if v_phone is not null then
    insert into public.customers (name, phone) values (nullif(trim(coalesce(p_name,'')),''), v_phone)
    on conflict (phone) where phone is not null do update set name = coalesce(excluded.name, public.customers.name)
    returning id into v_cust;
  end if;

  v_num := public.next_order_number('store');
  insert into public.orders (order_number, channel, status, payment_status, payment_method, customer_id, customer_name, customer_phone,
    subtotal_ngn, total_ngn, created_by, paid_at)
  values (v_num, 'store', 'delivered', 'paid', p_method, v_cust, coalesce(nullif(trim(coalesce(p_name,'')),''), 'Walk-in customer'),
    v_phone, v_total, v_total, auth.uid(), now())
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

-- ---------- staff may not move an unpaid Paystack order forward ----------
create or replace function public.set_order_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('pending','processing','packed','shipped','out_for_delivery','delivered','cancelled') then raise exception 'bad status'; end if;
  if p_status = 'cancelled' then perform public.cancel_order(p_order); return; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'cancelled' then return; end if;
  if o.payment_method = 'paystack' and o.payment_status <> 'paid' and p_status <> 'pending' then
    raise exception 'order is not paid';
  end if;
  update public.orders set status = p_status where id = p_order;
  insert into public.audit_log (actor, action, entity, entity_id, meta) values (auth.uid(), 'set_order_status', 'orders', p_order::text, jsonb_build_object('status', p_status));
end $$;

-- ---------- stock: set an absolute count under a row lock ----------
create or replace function public.set_stock_count(p_product uuid, p_count integer, p_note text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare v_old integer;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_count is null or p_count < 0 or p_count > 100000 then raise exception 'bad count'; end if;
  select stock into v_old from public.products where id = p_product for update;
  if not found then raise exception 'product not found'; end if;
  if v_old = p_count then return v_old; end if;
  update public.products set stock = p_count, updated_at = now() where id = p_product;
  insert into public.stock_movements (product_id, delta, reason, note, created_by) values (p_product, p_count - v_old, 'adjustment', p_note, auth.uid());
  insert into public.audit_log (actor, action, entity, entity_id, meta) values (auth.uid(), 'set_stock', 'products', p_product::text, jsonb_build_object('from', v_old, 'to', p_count, 'note', p_note));
  return p_count;
end $$;

-- ---------- email: claim before sending so each email goes out once ----------
create or replace function public.claim_confirmation_email(p_reference text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.orders set confirmation_emailed_at = now()
  where paystack_reference = p_reference and payment_status = 'paid' and confirmation_emailed_at is null and customer_email is not null
  returning id into v_id;
  if v_id is null then return null; end if;
  return jsonb_build_object('id', v_id);
end $$;
create or replace function public.release_confirmation_email(p_order uuid) returns void
language sql security definer set search_path = public as $$
  update public.orders set confirmation_emailed_at = null where id = p_order
$$;

-- returns the order only when its CURRENT status is one customers are told about and they have not been told yet
create or replace function public.claim_status_email(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  update public.orders set last_notified_status = status
  where id = p_order and channel = 'online' and status in ('shipped','out_for_delivery','delivered')
    and last_notified_status is distinct from status and customer_email is not null
  returning * into o;
  if o.id is null then return null; end if;
  return jsonb_build_object('id', o.id, 'status', o.status);
end $$;
create or replace function public.release_status_email(p_order uuid) returns void
language sql security definer set search_path = public as $$
  update public.orders set last_notified_status = null where id = p_order
$$;

-- ---------- who may run what ----------
revoke execute on function public.claim_confirmation_email(text)       from public, anon, authenticated;
revoke execute on function public.release_confirmation_email(uuid)     from public, anon, authenticated;
revoke execute on function public.claim_status_email(uuid)             from public, anon, authenticated;
revoke execute on function public.release_status_email(uuid)           from public, anon, authenticated;
grant  execute on function public.claim_confirmation_email(text)       to service_role;
grant  execute on function public.release_confirmation_email(uuid)     to service_role;
grant  execute on function public.claim_status_email(uuid)             to service_role;
grant  execute on function public.release_status_email(uuid)           to service_role;

revoke execute on function public.set_stock_count(uuid, integer, text) from public, anon;
grant  execute on function public.set_stock_count(uuid, integer, text) to authenticated;     -- re-checks is_staff() inside
revoke execute on function public.touch_page()                          from public, anon, authenticated;

-- security-definer functions replaced above keep their earlier grants, but re-state them so this file is self-contained
revoke execute on function public.create_online_order(jsonb)    from public, anon, authenticated;
revoke execute on function public.mark_order_paid(text, bigint) from public, anon, authenticated;
grant  execute on function public.create_online_order(jsonb)    to service_role;
grant  execute on function public.mark_order_paid(text, bigint) to service_role;
revoke execute on function public.record_pos_sale(jsonb, text, text, text) from public, anon;
revoke execute on function public.set_order_status(uuid, text)             from public, anon;
grant  execute on function public.record_pos_sale(jsonb, text, text, text) to authenticated;
grant  execute on function public.set_order_status(uuid, text)             to authenticated;
