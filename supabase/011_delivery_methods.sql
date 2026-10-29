-- Run AFTER 010. Adds STORE PICKUP as a second way to receive an order.
--   * every order is either 'delivery' (the current flow) or 'pickup' (free, collected from the shop);
--   * a pickup order is still PAID ONLINE first, so nobody can collect without paying;
--   * the rules below live HERE, in the database, so they hold even if the website code had a bug.
-- Safe to run more than once.

alter table public.orders
  add column if not exists delivery_method  text not null default 'delivery',
  add column if not exists pickup_code      text,       -- shown to the customer in the "ready" email; staff ask to see it at the counter
  add column if not exists attention_reason text;       -- why an order was flagged, e.g. the city is in a different state than the one chosen

alter table public.orders drop constraint if exists orders_delivery_method_check;
alter table public.orders add  constraint orders_delivery_method_check check (delivery_method in ('delivery','pickup'));
alter table public.orders drop constraint if exists orders_pickup_free;
alter table public.orders add  constraint orders_pickup_free check (delivery_method <> 'pickup' or delivery_ngn = 0);
alter table public.orders drop constraint if exists orders_pickup_code_only;
alter table public.orders add  constraint orders_pickup_code_only check (pickup_code is null or delivery_method = 'pickup');
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add  constraint orders_status_check
  check (status in ('pending','processing','packed','shipped','out_for_delivery','ready_for_pickup','delivered','cancelled'));

-- A flagged order becomes "needs attention" the moment it is PAID (an unpaid, abandoned checkout is not worth a person's time).
create or replace function public.orders_flag_on_paid() returns trigger language plpgsql as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and new.attention_reason is not null then
    new.needs_attention := true;
  end if;
  return new;
end $$;
drop trigger if exists orders_flag_on_paid on public.orders;
create trigger orders_flag_on_paid before update of payment_status on public.orders for each row execute function public.orders_flag_on_paid();

-- ---------- creating an online order: now knows about pickup ----------
create or replace function public.create_online_order(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_sub integer; v_id uuid; v_num text; v_cust uuid; v_phone text := nullif(public.norm_phone(p->>'phone'), '');
        v_method text := coalesce(nullif(p->>'delivery_method', ''), 'delivery');
        v_reason text := nullif(left(coalesce(p->>'attention_reason', ''), 200), '');
begin
  if v_method not in ('delivery','pickup') then raise exception 'bad_delivery_method'; end if;
  if v_method = 'pickup' and (p->>'delivery')::int <> 0 then raise exception 'pickup_is_free'; end if;

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
    customer_name, customer_email, customer_phone, address, subtotal_ngn, delivery_ngn, discount_ngn, discount_code, total_ngn,
    delivery_method, attention_reason)
  values (v_num, 'online', 'paystack', p->>'reference', v_cust, p->>'name', p->>'email', v_phone, p->'address',
    v_sub, (p->>'delivery')::int, (p->>'discount')::int, nullif(p->>'discount_code',''), (p->>'total')::int,
    v_method, v_reason)
  returning id into v_id;

  with q as (select (e->>'product_id')::uuid pid, sum((e->>'qty')::int) qty
             from jsonb_array_elements(p->'items') e group by 1)
  insert into public.order_items (order_id, product_id, name, unit_price_ngn, qty)
  select v_id, pr.id, pr.name, pr.price_ngn, q.qty from q join public.products pr on pr.id = q.pid;

  return v_num;
end $$;
revoke execute on function public.create_online_order(jsonb) from public, anon, authenticated;
grant  execute on function public.create_online_order(jsonb) to service_role;

-- ---------- changing an order's status: the steps depend on how the order leaves the shop ----------
create or replace function public.set_order_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('pending','processing','packed','shipped','out_for_delivery','ready_for_pickup','delivered','cancelled') then raise exception 'bad status'; end if;
  if p_status = 'cancelled' then perform public.cancel_order(p_order); return; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'cancelled' then return; end if;
  if o.payment_method = 'paystack' and o.payment_status <> 'paid' and p_status <> 'pending' then
    raise exception 'order is not paid';
  end if;
  if o.delivery_method = 'pickup' and p_status in ('packed','shipped','out_for_delivery') then
    raise exception 'a pickup order cannot be shipped';
  end if;
  if o.delivery_method = 'delivery' and p_status = 'ready_for_pickup' then
    raise exception 'only a pickup order can be marked ready for pickup';
  end if;
  -- "collected" only happens after "ready": that is when the customer is emailed and the pickup code is issued
  if o.delivery_method = 'pickup' and p_status = 'delivered' and o.status <> 'ready_for_pickup' then
    raise exception 'mark the order ready for pickup first';
  end if;
  update public.orders set status = p_status,
         pickup_code = case when p_status = 'ready_for_pickup' and pickup_code is null
                            then upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)) else pickup_code end
   where id = p_order;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'set_order_status', 'orders', p_order::text, jsonb_build_object('status', p_status));
end $$;
revoke execute on function public.set_order_status(uuid, text) from public, anon;
grant  execute on function public.set_order_status(uuid, text) to authenticated;     -- re-checks is_staff() inside

-- ---------- status emails: "ready for pickup" is now one of them (still once per status) ----------
create or replace function public.claim_status_email(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  update public.orders set last_notified_status = status
  where id = p_order and channel = 'online' and status in ('shipped','out_for_delivery','ready_for_pickup','delivered')
    and last_notified_status is distinct from status and customer_email is not null
  returning * into o;
  if o.id is null then return null; end if;
  return jsonb_build_object('id', o.id, 'status', o.status);
end $$;
revoke execute on function public.claim_status_email(uuid) from public, anon, authenticated;
grant  execute on function public.claim_status_email(uuid) to service_role;

-- trigger functions never need to be callable by anyone
revoke execute on function public.orders_flag_on_paid() from public, anon, authenticated;
