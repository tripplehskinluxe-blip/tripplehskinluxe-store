-- Run AFTER 011. Order cancellation, stock restore and refunds.
--   * a customer can cancel their own order until it is shipped (pickup: until it is "ready"), proving who they are with order number + phone;
--   * a cancelled, PAID order gets exactly ONE refund ticket (a unique key makes a second one impossible);
--   * only the website's server can ask Paystack for the money back; nobody can do it from a browser;
--   * every cancellation puts the stock back, once.
-- Safe to run more than once.

alter table public.orders
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  text,          -- 'customer' | 'staff'
  add column if not exists cancel_reason text;
alter table public.orders drop constraint if exists orders_cancelled_by_check;
alter table public.orders add  constraint orders_cancelled_by_check check (cancelled_by is null or cancelled_by in ('customer','staff'));

-- ONE refund per order, ever. This single key is what makes a double refund impossible.
create table if not exists public.order_refunds (
  order_id           uuid primary key references public.orders(id) on delete cascade,
  amount_ngn         integer not null check (amount_ngn > 0),
  status             text not null default 'requested' check (status in ('requested','processing','accepted','processed','failed')),
  paystack_refund_id text,
  error              text,
  attempts           integer not null default 0,
  requested_by       text not null default 'system',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.order_refunds enable row level security;
drop policy if exists "staff read refunds" on public.order_refunds;
create policy "staff read refunds" on public.order_refunds for select to authenticated using (public.is_staff());
revoke all on public.order_refunds from public, anon, authenticated;
grant select on public.order_refunds to authenticated;                 -- the policy above limits it to staff
grant all    on public.order_refunds to service_role;

-- Which customer emails have been sent for an order, so none is ever sent twice.
create table if not exists public.order_emails (
  order_id uuid not null references public.orders(id) on delete cascade,
  kind     text not null check (kind in ('cancelled','refund_issued','review_invite')),
  sent_at  timestamptz not null default now(),
  primary key (order_id, kind)
);
alter table public.order_emails enable row level security;
revoke all on public.order_emails from public, anon, authenticated;
grant all  on public.order_emails to service_role;                     -- the server only

-- ---------- the one place an order is cancelled (internal: nobody can call it directly) ----------
create or replace function public._cancel_core(p_order uuid, p_by text, p_actor uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; v_paid boolean;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'cancelled' then return jsonb_build_object('already', true, 'paid', o.payment_status in ('paid','refunded')); end if;
  v_paid := o.payment_status = 'paid';
  if exists (select 1 from public.stock_movements where order_id = o.id and reason in ('order','pos')) then
    update public.products p set stock = p.stock + oi.qty, updated_at = now()
    from public.order_items oi where oi.order_id = o.id and oi.product_id = p.id;
    insert into public.stock_movements (product_id, delta, reason, order_id, created_by)
    select product_id, qty, 'cancel', o.id, p_actor from public.order_items where order_id = o.id;
  end if;
  update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = p_by,
         cancel_reason = nullif(left(coalesce(p_reason, ''), 200), ''),
         needs_attention = (needs_attention or payment_status = 'paid') where id = o.id;
  if v_paid and o.channel = 'online' and o.payment_method = 'paystack' and o.paystack_reference is not null then
    insert into public.order_refunds (order_id, amount_ngn, requested_by) values (o.id, o.total_ngn, p_by) on conflict (order_id) do nothing;
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (p_actor, 'cancel_order', 'orders', o.id::text, jsonb_build_object('refund_due', v_paid, 'by', p_by));
  return jsonb_build_object('already', false, 'paid', v_paid);
end $$;
revoke execute on function public._cancel_core(uuid, text, uuid, text) from public, anon, authenticated;

-- staff cancel from the team area (same rules as before)
create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public._cancel_core(p_order, 'staff', auth.uid(), null);
end $$;
revoke execute on function public.cancel_order(uuid) from public, anon, authenticated;   -- reached only through set_order_status, exactly as before

-- staff cancel through the website's server (so the refund and the email follow). The server has already checked the login + two-factor.
create or replace function public.cancel_order_for(p_actor uuid, p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role in ('admin','staff')) then raise exception 'forbidden' using errcode = '42501'; end if;
  return public._cancel_core(p_order, 'staff', p_actor, null);
end $$;
revoke execute on function public.cancel_order_for(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.cancel_order_for(uuid, uuid) to service_role;

-- a customer cancelling their own order. Wrong order number or wrong phone look exactly the same ("not_found").
create or replace function public.customer_cancel_order(p_order_number text, p_phone text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; r jsonb;
begin
  select * into o from public.orders where order_number = upper(trim(coalesce(p_order_number, ''))) and channel = 'online';
  if not found or o.customer_phone is null or public.norm_phone(p_phone) is distinct from public.norm_phone(o.customer_phone) then
    return jsonb_build_object('code', 'not_found');
  end if;
  select * into o from public.orders where id = o.id for update;                         -- decide on the order as it is RIGHT NOW
  if o.status = 'cancelled' then return jsonb_build_object('code', 'ok', 'already', true, 'order_id', o.id, 'paid', o.payment_status in ('paid','refunded')); end if;
  if not ( (o.delivery_method = 'delivery' and o.status in ('pending','processing','packed'))
        or (o.delivery_method = 'pickup'   and o.status in ('pending','processing')) )
     or o.payment_status not in ('unpaid','failed','paid') then
    return jsonb_build_object('code', 'not_cancellable', 'status', o.status);
  end if;
  r := public._cancel_core(o.id, 'customer', null, p_reason);
  return jsonb_build_object('code', 'ok', 'already', false, 'order_id', o.id, 'paid', (r->>'paid')::boolean);
end $$;
revoke execute on function public.customer_cancel_order(text, text, text) from public, anon, authenticated;
grant  execute on function public.customer_cancel_order(text, text, text) to service_role;

-- ---------- the refund, step by step ----------
-- 1) claim it: only one attempt can be in flight; at most 5 automatic attempts (staff can retry by hand)
create or replace function public.refund_claim(p_order uuid, p_manual boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; r public.order_refunds;
begin
  select * into o from public.orders where id = p_order;
  if not found then return jsonb_build_object('claimed', false, 'reason', 'not_found'); end if;
  if o.status <> 'cancelled' or o.payment_status <> 'paid' or o.channel <> 'online' or o.paystack_reference is null then
    return jsonb_build_object('claimed', false, 'reason', 'not_refundable', 'payment_status', o.payment_status);
  end if;
  insert into public.order_refunds (order_id, amount_ngn, requested_by) values (o.id, o.total_ngn, 'system') on conflict (order_id) do nothing;
  update public.order_refunds set status = 'processing', attempts = attempts + 1, error = null, updated_at = now()
   where order_id = o.id
     and (status in ('requested','failed') or (status = 'processing' and updated_at < now() - interval '10 minutes'))
     and (p_manual or attempts < 5)
  returning * into r;
  if r.order_id is null then
    select * into r from public.order_refunds where order_id = o.id;
    return jsonb_build_object('claimed', false, 'reason', 'already', 'status', r.status, 'attempts', r.attempts);
  end if;
  return jsonb_build_object('claimed', true, 'reference', o.paystack_reference, 'amount_kobo', r.amount_ngn::bigint * 100, 'order_number', o.order_number);
end $$;
revoke execute on function public.refund_claim(uuid, boolean) from public, anon, authenticated;
grant  execute on function public.refund_claim(uuid, boolean) to service_role;

-- 2) record what Paystack said to our request
create or replace function public.refund_result(p_order uuid, p_ok boolean, p_paystack_id text default null, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.order_refunds;
begin
  select * into r from public.order_refunds where order_id = p_order for update;
  if not found or r.status <> 'processing' then return; end if;                           -- only the attempt that claimed it can report
  if p_ok then
    update public.order_refunds set status = 'accepted', paystack_refund_id = left(p_paystack_id, 80), error = null, updated_at = now() where order_id = p_order;
    update public.orders set payment_status = 'refunded', needs_attention = false where id = p_order and payment_status = 'paid';
    insert into public.audit_log (actor, action, entity, entity_id, meta) values (null, 'refund_requested', 'orders', p_order::text, jsonb_build_object('amount', r.amount_ngn));
  else
    update public.order_refunds set status = 'failed', error = left(coalesce(p_error, 'unknown'), 300), updated_at = now() where order_id = p_order;
    update public.orders set needs_attention = true where id = p_order;
    insert into public.audit_log (actor, action, entity, entity_id, meta) values (null, 'refund_failed', 'orders', p_order::text, jsonb_build_object('error', left(coalesce(p_error, ''), 120)));
  end if;
end $$;
revoke execute on function public.refund_result(uuid, boolean, text, text) from public, anon, authenticated;
grant  execute on function public.refund_result(uuid, boolean, text, text) to service_role;

-- 3) later news from Paystack (refund.pending / processing / processed / failed / needs-attention), already signature-checked by the server
create or replace function public.refund_event(p_reference text, p_state text, p_paystack_id text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; r public.order_refunds; v_state text;
begin
  select * into o from public.orders where paystack_reference = p_reference;
  if not found or o.status <> 'cancelled' then return; end if;                           -- only cancelled orders are ever refunded
  v_state := case when p_state in ('pending','processing') then 'accepted' when p_state = 'processed' then 'processed'
                  when p_state in ('failed','needs-attention') then 'failed' end;
  if v_state is null then return; end if;
  select * into r from public.order_refunds where order_id = o.id for update;
  if not found then
    if v_state = 'failed' or o.payment_status not in ('paid','refunded') then return; end if;
    insert into public.order_refunds (order_id, amount_ngn, status, paystack_refund_id, requested_by)       -- refunded by hand in the Paystack dashboard
    values (o.id, o.total_ngn, v_state, left(p_paystack_id, 80), 'dashboard');
  else
    if r.status = 'processed' and v_state <> 'processed' then return; end if;             -- never go backwards
    update public.order_refunds set status = v_state, updated_at = now(), paystack_refund_id = coalesce(left(p_paystack_id, 80), paystack_refund_id),
           error = case when v_state = 'failed' then case when p_state = 'needs-attention' then 'Paystack needs the customer''s bank details' else 'Paystack could not complete the refund' end else null end
     where order_id = o.id;
  end if;
  if v_state = 'failed' then
    update public.orders set payment_status = 'paid', needs_attention = true where id = o.id and payment_status = 'refunded';
    update public.orders set needs_attention = true where id = o.id;
  else
    update public.orders set payment_status = 'refunded', needs_attention = false where id = o.id and payment_status in ('paid','refunded');
  end if;
end $$;
revoke execute on function public.refund_event(text, text, text) from public, anon, authenticated;
grant  execute on function public.refund_event(text, text, text) to service_role;

-- ---------- emails: claim before sending, release if sending failed ----------
create or replace function public.claim_order_email(p_order uuid, p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.order_emails (order_id, kind) values (p_order, p_kind) on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke execute on function public.claim_order_email(uuid, text) from public, anon, authenticated;
grant  execute on function public.claim_order_email(uuid, text) to service_role;
create or replace function public.release_order_email(p_order uuid, p_kind text) returns void
language sql security definer set search_path = public as $$ delete from public.order_emails where order_id = p_order and kind = p_kind $$;
revoke execute on function public.release_order_email(uuid, text) from public, anon, authenticated;
grant  execute on function public.release_order_email(uuid, text) to service_role;
