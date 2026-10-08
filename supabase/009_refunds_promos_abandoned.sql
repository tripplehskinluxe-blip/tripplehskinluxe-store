-- Run AFTER 008.
-- 1) Promo codes get a usage limit and an expiry date.
-- 2) Cancelling a PAID order flags it "refund due"; an admin marks it refunded after refunding in Paystack.
-- 3) Unpaid online orders are cancelled automatically after a set number of hours (Settings -> Delivery & returns, default 72).

-- ---------- 1) promo limits ----------
alter table public.discounts
  add column if not exists max_uses integer check (max_uses is null or max_uses > 0),   -- empty = unlimited
  add column if not exists expires_at timestamptz;                                       -- empty = never expires

create or replace function public.mark_order_paid(p_reference text, p_amount_kobo bigint) returns text
language plpgsql security definer set search_path = public as $$
declare o public.orders; v_uses integer; v_max integer;
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
  if o.discount_code is not null then
    update public.discounts set uses = uses + 1 where code = o.discount_code returning uses, max_uses into v_uses, v_max;
    -- The customer already paid the discounted price, so the order stands. But if two people took the last use at the same moment,
    -- the code is now over its limit: flag the order so a person can see it.
    if v_max is not null and v_uses > v_max then update public.orders set needs_attention = true where id = o.id; end if;
  end if;
  return 'paid';
end $$;

-- ---------- 2) refunds ----------
-- Cancelling puts stock back (if it was taken) and cancels the order. If the customer had PAID, the money is still with the shop:
-- flag the order so it shows up under "Needs attention" until an admin has refunded it.
create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'cancelled' then return; end if;
  if exists (select 1 from public.stock_movements where order_id = o.id and reason in ('order','pos')) then
    update public.products p set stock = p.stock + oi.qty, updated_at = now()
    from public.order_items oi where oi.order_id = o.id and oi.product_id = p.id;
    insert into public.stock_movements (product_id, delta, reason, order_id, created_by)
    select product_id, qty, 'cancel', o.id, auth.uid() from public.order_items where order_id = o.id;
  end if;
  update public.orders set status = 'cancelled', needs_attention = (needs_attention or payment_status = 'paid') where id = o.id;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'cancel_order', 'orders', o.id::text, jsonb_build_object('refund_due', o.payment_status = 'paid'));
end $$;

-- After the admin has refunded the customer (in the Paystack dashboard, or cash in the shop), record it. Admin + two-factor only.
create or replace function public.mark_order_refunded(p_order uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.status <> 'cancelled' or o.payment_status <> 'paid' then raise exception 'only a cancelled, paid order can be marked refunded'; end if;
  update public.orders set payment_status = 'refunded', needs_attention = false where id = o.id;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'mark_refunded', 'orders', o.id::text, jsonb_build_object('note', left(coalesce(p_note, ''), 200), 'amount', o.total_ngn));
end $$;

revoke execute on function public.mark_order_refunded(uuid, text) from public, anon;
grant  execute on function public.mark_order_refunded(uuid, text) to authenticated;   -- re-checks admin + two-factor inside

-- ---------- 3) abandoned checkouts ----------
create index if not exists orders_abandoned_idx on public.orders (created_at)
  where status = 'pending' and payment_status in ('unpaid', 'failed');

-- Cancels online Paystack orders that were never paid within N hours (N = Settings -> delivery.abandonAfterHours, default 72).
-- No stock was ever taken for them, so nothing else changes. If one of those customers pays later anyway, mark_order_paid()
-- keeps the money and flags the order for a person (paid_cancelled). Safe to run as often as you like.
create or replace function public.cancel_abandoned_orders() returns integer
language plpgsql security definer set search_path = public as $$
declare v_hours integer; n integer;
begin
  select case when (value ->> 'abandonAfterHours') ~ '^[0-9]{1,4}$' then (value ->> 'abandonAfterHours')::integer end
    into v_hours from public.settings where key = 'delivery';
  if v_hours is null or v_hours < 1 then v_hours := 72; end if;
  with c as (
    update public.orders set status = 'cancelled'
    where channel = 'online' and payment_method = 'paystack' and status = 'pending' and payment_status in ('unpaid', 'failed')
      and created_at < now() - make_interval(hours => v_hours)
    returning id)
  select count(*) into n from c;
  if n > 0 then
    insert into public.audit_log (actor, action, entity, entity_id, meta) values (null, 'auto_cancel_abandoned', 'orders', null, jsonb_build_object('count', n, 'after_hours', v_hours));
  end if;
  return n;
end $$;
revoke execute on function public.cancel_abandoned_orders() from public, anon, authenticated;
grant  execute on function public.cancel_abandoned_orders() to service_role;                      -- the server only

-- mark_order_paid / cancel_order were replaced above: keep their access rules exactly as before
revoke execute on function public.mark_order_paid(text, bigint) from public, anon, authenticated;
grant  execute on function public.mark_order_paid(text, bigint) to service_role;
