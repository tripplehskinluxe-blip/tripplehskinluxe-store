-- Run AFTER 015. A refund is never sent to Paystack automatically any more: every refund for a cancelled, paid order waits for a
-- person with the "approve refunds" permission to approve it.
--   * customers can still cancel (until shipped); a PAID cancellation is flagged and waits. Its stock stays reserved until approval,
--     because the goods may already be with the customer. If the refund is DECLINED, the order goes back to the state it was in;
--   * a cancellation by staff cancels at once (they checked the goods), but the money still waits for approval;
--   * approving needs the permission (admin, or staff the admin has authorised), a verified two-factor session, and a staff approver
--     cannot approve a refund they requested themselves;
--   * the function that actually asks Paystack (refund_claim) can only pick up APPROVED refunds: even a bug or a stray call cannot
--     make money move without approval;
--   * the permission is off by default, only an admin can switch it, nobody can give it to themselves, and every decision is logged.
-- Safe to run more than once.

alter table public.profiles add column if not exists can_approve_refunds boolean not null default false;

create or replace function public.can_approve_refunds() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.is_staff() and exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and can_approve_refunds))
$$;
revoke execute on function public.can_approve_refunds() from public, anon;
grant  execute on function public.can_approve_refunds() to authenticated;

alter table public.orders add column if not exists cancel_prev_status text;

alter table public.order_refunds drop constraint if exists order_refunds_status_check;
alter table public.order_refunds add  constraint order_refunds_status_check
  check (status in ('awaiting_approval','declined','requested','processing','accepted','processed','failed'));
alter table public.order_refunds alter column status set default 'awaiting_approval';
alter table public.order_refunds
  add column if not exists requested_by_user uuid references auth.users(id) on delete set null,
  add column if not exists decided_by        uuid references auth.users(id) on delete set null,
  add column if not exists decided_at        timestamptz,
  add column if not exists decision_note     text;
update public.order_refunds set status = 'awaiting_approval' where status = 'requested';     -- anything not yet sent to Paystack now needs a person

alter table public.order_emails drop constraint if exists order_emails_kind_check;
alter table public.order_emails add  constraint order_emails_kind_check check (kind in ('cancelled','refund_issued','review_invite','refund_declined'));

-- put the stock back once (never twice)
create or replace function public._restore_stock(p_order uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.stock_movements where order_id = p_order and reason in ('order','pos'))
     and not exists (select 1 from public.stock_movements where order_id = p_order and reason = 'cancel') then
    update public.products p set stock = p.stock + oi.qty, updated_at = now()
      from public.order_items oi where oi.order_id = p_order and oi.product_id = p.id;
    insert into public.stock_movements (product_id, delta, reason, order_id, created_by)
      select product_id, qty, 'cancel', p_order, p_actor from public.order_items where order_id = p_order;
  end if;
end $$;
revoke execute on function public._restore_stock(uuid, uuid) from public, anon, authenticated;

create or replace function public._cancel_core(p_order uuid, p_by text, p_actor uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; v_paid boolean; v_online boolean;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'cancelled' then return jsonb_build_object('already', true, 'paid', o.payment_status in ('paid','refunded')); end if;
  v_paid   := o.payment_status = 'paid';
  v_online := o.channel = 'online' and o.payment_method = 'paystack' and o.paystack_reference is not null;
  if not (v_paid and p_by = 'customer') then perform public._restore_stock(o.id, p_actor); end if;   -- a PAID customer cancellation keeps its stock until the refund is approved
  update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = p_by,
         cancel_reason = nullif(left(coalesce(p_reason, ''), 200), ''),
         cancel_prev_status = case when v_paid and p_by = 'customer' then o.status else null end,
         needs_attention = (needs_attention or payment_status = 'paid') where id = o.id;
  if v_paid and v_online then
    insert into public.order_refunds (order_id, amount_ngn, requested_by, requested_by_user, status)
    values (o.id, o.total_ngn, p_by, p_actor, 'awaiting_approval')
    on conflict (order_id) do update set status = 'awaiting_approval', requested_by = excluded.requested_by, requested_by_user = excluded.requested_by_user,
           decided_by = null, decided_at = null, decision_note = null, updated_at = now()
     where public.order_refunds.status = 'declined';                                              -- a new cancellation re-opens a declined refund
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (p_actor, 'cancel_order', 'orders', o.id::text, jsonb_build_object('refund_due', v_paid, 'by', p_by));
  return jsonb_build_object('already', false, 'paid', v_paid);
end $$;
revoke execute on function public._cancel_core(uuid, text, uuid, text) from public, anon, authenticated;

-- THE money gate: only an APPROVED ('requested') or failed-and-retryable refund can be claimed. 'awaiting_approval' and 'declined' never can.
drop function if exists public.refund_claim(uuid, boolean);
create or replace function public.refund_claim(p_order uuid, p_manual boolean default false, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; r public.order_refunds;
begin
  select * into o from public.orders where id = p_order;
  if not found then return jsonb_build_object('claimed', false, 'reason', 'not_found'); end if;
  if o.status <> 'cancelled' or o.payment_status <> 'paid' or o.channel <> 'online' or o.paystack_reference is null then
    return jsonb_build_object('claimed', false, 'reason', 'not_refundable', 'payment_status', o.payment_status);
  end if;
  insert into public.order_refunds (order_id, amount_ngn, requested_by, requested_by_user, status)       -- no row yet: ask for approval, never skip it
  values (o.id, o.total_ngn, 'system', p_actor, 'awaiting_approval') on conflict (order_id) do nothing;
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
revoke execute on function public.refund_claim(uuid, boolean, uuid) from public, anon, authenticated;
grant  execute on function public.refund_claim(uuid, boolean, uuid) to service_role;

-- approve: needs the permission and a verified two-factor session (both inside can_approve_refunds)
create or replace function public.approve_refund(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.order_refunds; o public.orders;
begin
  if not public.can_approve_refunds() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  select * into r from public.order_refunds where order_id = p_order for update;
  if not found or r.status <> 'awaiting_approval' then return jsonb_build_object('code', 'not_awaiting', 'status', r.status); end if;
  if o.status <> 'cancelled' or o.payment_status <> 'paid' then return jsonb_build_object('code', 'not_refundable'); end if;
  if r.requested_by_user is not null and r.requested_by_user = auth.uid() and not public.is_admin() then
    raise exception 'you cannot approve a refund that you requested yourself' using errcode = '42501';
  end if;
  update public.order_refunds set status = 'requested', decided_by = auth.uid(), decided_at = now(), updated_at = now() where order_id = p_order;
  if o.cancelled_by = 'customer' then perform public._restore_stock(o.id, auth.uid()); end if;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'refund_approved', 'orders', p_order::text, jsonb_build_object('amount', r.amount_ngn, 'requested_by', r.requested_by));
  return jsonb_build_object('code', 'ok');
end $$;
revoke execute on function public.approve_refund(uuid) from public, anon;
grant  execute on function public.approve_refund(uuid) to authenticated;

-- decline: a customer's cancellation is undone (the order goes back to where it was); a staff cancellation stays cancelled, without a refund
create or replace function public.decline_refund(p_order uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.order_refunds; o public.orders; v_back boolean := false;
begin
  if not public.can_approve_refunds() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  select * into r from public.order_refunds where order_id = p_order for update;
  if not found or r.status <> 'awaiting_approval' then return jsonb_build_object('code', 'not_awaiting', 'status', r.status); end if;
  update public.order_refunds set status = 'declined', decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(left(coalesce(p_note, ''), 200), ''), updated_at = now() where order_id = p_order;
  if o.status = 'cancelled' and o.cancelled_by = 'customer' and o.cancel_prev_status is not null then
    update public.orders set status = cancel_prev_status, cancelled_at = null, cancelled_by = null, cancel_reason = null,
           cancel_prev_status = null, needs_attention = false where id = o.id;
    v_back := true;
  else
    update public.orders set needs_attention = false where id = o.id;
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'refund_declined', 'orders', p_order::text, jsonb_build_object('amount', r.amount_ngn, 'reinstated', v_back));
  return jsonb_build_object('code', 'ok', 'reinstated', v_back);
end $$;
revoke execute on function public.decline_refund(uuid, text) from public, anon;
grant  execute on function public.decline_refund(uuid, text) to authenticated;

-- the permission switch (admin only, never for yourself) and the list that shows it
create or replace function public.team_set_refunds(p_user uuid, p_can boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_can is null then raise exception 'choose on or off'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'you cannot do this to your own account'; end if;
  select role into r from public.profiles where id = p_user for update;
  if not found or r <> 'staff' then raise exception 'that person is not a staff member'; end if;
  update public.profiles set can_approve_refunds = p_can where id = p_user;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'team_set_refunds', 'profiles', p_user::text, jsonb_build_object('allowed', p_can));
end $$;
revoke execute on function public.team_set_refunds(uuid, boolean) from public, anon;
grant  execute on function public.team_set_refunds(uuid, boolean) to authenticated;

create or replace function public.team_set_role(p_user uuid, p_from text, p_to text) returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not ((p_from = 'customer' and p_to = 'staff') or (p_from = 'staff' and p_to = 'customer')) then raise exception 'that role change is not allowed here'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'you cannot do this to your own account'; end if;
  select role into r from public.profiles where id = p_user for update;
  if not found or r <> p_from then raise exception 'that person does not have the expected role'; end if;
  update public.profiles set role = p_to, can_manage_products = false, can_approve_refunds = false where id = p_user;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'team_set_role', 'profiles', p_user::text, jsonb_build_object('from', p_from, 'to', p_to));
end $$;
revoke execute on function public.team_set_role(uuid, text, text) from public, anon;
grant  execute on function public.team_set_role(uuid, text, text) to authenticated;

drop function if exists public.team_list();
create or replace function public.team_list()
returns table (id uuid, email text, role text, full_name text, created_at timestamptz, last_sign_in_at timestamptz, can_manage_products boolean, can_approve_refunds boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, p.role, p.full_name, u.created_at, u.last_sign_in_at, p.can_manage_products, p.can_approve_refunds
    from public.profiles p join auth.users u on u.id = p.id
    where p.role in ('staff', 'admin')
    order by (p.role = 'admin') desc, u.created_at;
end $$;
revoke execute on function public.team_list() from public, anon;
grant  execute on function public.team_list() to authenticated;
