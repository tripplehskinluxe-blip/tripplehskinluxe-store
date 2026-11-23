-- STOCK HOLD (migration 019). Run once in the SHOP project, SQL Editor, BEFORE deploying the matching app code. Safe to re-run.
-- Checkout takes the stock for 20 minutes. Paying in time turns the hold into a sale. An expired hold returns its stock
-- (release_hold, called by the server only after Paystack confirms the payment is not coming). A late payment uses the normal stock check.
-- Cancelling an order gives its stock back at once.

-- 1) stock-movement types: "hold" (taken at checkout) and "release" (given back). Existing types are kept.
DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.stock_movements'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%reason%' LOOP
    EXECUTE format('ALTER TABLE public.stock_movements DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_reason_check
  CHECK (reason IN ('order','pos','import','adjustment','cancel','hold','release'));

-- 2) the order knows whether it holds stock, and until when
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_held boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

-- 3) checkout: lock the products, check the stock, take it and hold it for 20 minutes. All or nothing.
CREATE OR REPLACE FUNCTION public.create_online_order(p jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub integer; v_id uuid; v_num text; v_cust uuid; v_phone text := nullif(public.norm_phone(p->>'phone'), '');
        v_method text := coalesce(nullif(p->>'delivery_method', ''), 'delivery');
        v_reason text := nullif(left(coalesce(p->>'attention_reason', ''), 200), '');
BEGIN
  IF v_method NOT IN ('delivery','pickup') THEN RAISE EXCEPTION 'bad_delivery_method'; END IF;
  IF v_method = 'pickup' AND (p->>'delivery')::int <> 0 THEN RAISE EXCEPTION 'pickup_is_free'; END IF;

  PERFORM 1 FROM public.products WHERE id IN (SELECT (e->>'product_id')::uuid FROM jsonb_array_elements(p->'items') e) ORDER BY id FOR UPDATE;

  WITH q AS (SELECT (e->>'product_id')::uuid pid, sum((e->>'qty')::int) qty FROM jsonb_array_elements(p->'items') e GROUP BY 1)
  SELECT coalesce(sum(pr.price_ngn * q.qty), 0) INTO v_sub
  FROM q JOIN public.products pr ON pr.id = q.pid WHERE pr.is_active AND pr.stock >= q.qty;

  IF v_sub = 0 OR v_sub <> (p->>'subtotal')::int THEN RAISE EXCEPTION 'price_or_stock_mismatch'; END IF;
  IF (p->>'total')::int <> v_sub + (p->>'delivery')::int - (p->>'discount')::int THEN RAISE EXCEPTION 'total_mismatch'; END IF;

  IF v_phone IS NOT NULL THEN
    INSERT INTO public.customers (name, email, phone) VALUES (p->>'name', p->>'email', v_phone)
    ON CONFLICT (phone) WHERE phone IS NOT NULL DO UPDATE SET name = excluded.name, email = excluded.email
    RETURNING id INTO v_cust;
  ELSE
    INSERT INTO public.customers (name, email) VALUES (p->>'name', p->>'email') RETURNING id INTO v_cust;
  END IF;

  v_num := public.next_order_number('online');
  INSERT INTO public.orders (order_number, channel, payment_method, paystack_reference, customer_id,
    customer_name, customer_email, customer_phone, address, subtotal_ngn, delivery_ngn, discount_ngn, discount_code, total_ngn,
    delivery_method, attention_reason, stock_held, hold_expires_at)
  VALUES (v_num, 'online', 'paystack', p->>'reference', v_cust, p->>'name', p->>'email', v_phone, p->'address',
    v_sub, (p->>'delivery')::int, (p->>'discount')::int, nullif(p->>'discount_code',''), (p->>'total')::int,
    v_method, v_reason, true, now() + interval '20 minutes')
  RETURNING id INTO v_id;

  WITH q AS (SELECT (e->>'product_id')::uuid pid, sum((e->>'qty')::int) qty FROM jsonb_array_elements(p->'items') e GROUP BY 1)
  INSERT INTO public.order_items (order_id, product_id, name, unit_price_ngn, qty)
  SELECT v_id, pr.id, pr.name, pr.price_ngn, q.qty FROM q JOIN public.products pr ON pr.id = q.pid;

  UPDATE public.products pr SET stock = pr.stock - oi.qty, updated_at = now()
    FROM public.order_items oi WHERE oi.order_id = v_id AND oi.product_id = pr.id;
  INSERT INTO public.stock_movements (product_id, delta, reason, order_id)
    SELECT product_id, -qty, 'hold', v_id FROM public.order_items WHERE order_id = v_id;
  RETURN v_num;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_online_order(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_online_order(jsonb) TO service_role;

-- 4) payment: a held order converts its hold into a sale (no second take); an unheld order uses the normal stock check
CREATE OR REPLACE FUNCTION public.mark_order_paid(p_reference text, p_amount_kobo bigint) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; v_uses integer; v_max integer;
BEGIN
  SELECT * INTO o FROM public.orders WHERE paystack_reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF o.payment_status = 'paid' THEN RETURN 'already_paid'; END IF;

  IF p_amount_kobo <> o.total_ngn::bigint * 100 THEN
    UPDATE public.orders SET needs_attention = true WHERE id = o.id;
    RETURN 'amount_mismatch';
  END IF;

  IF o.status = 'cancelled' THEN
    UPDATE public.orders SET payment_status = 'paid', paid_at = now(), needs_attention = true WHERE id = o.id;
    INSERT INTO public.audit_log (actor, action, entity, entity_id, meta)
    VALUES (null, 'paid_after_cancel', 'orders', o.id::text, jsonb_build_object('reference', p_reference));
    RETURN 'paid_cancelled';
  END IF;

  IF o.stock_held THEN
    UPDATE public.orders SET stock_held = false, hold_expires_at = null WHERE id = o.id;
    INSERT INTO public.stock_movements (product_id, delta, reason, order_id)
      SELECT product_id, 0, 'order', o.id FROM public.order_items WHERE order_id = o.id;
    UPDATE public.orders SET payment_status = 'paid', status = 'processing', paid_at = now() WHERE id = o.id;
  ELSE
    PERFORM 1 FROM public.products WHERE id IN (SELECT product_id FROM public.order_items WHERE order_id = o.id) ORDER BY id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id
               WHERE oi.order_id = o.id AND p.stock < oi.qty) THEN
      UPDATE public.orders SET payment_status = 'paid', paid_at = now(), needs_attention = true WHERE id = o.id;
      RETURN 'paid_stock_issue';
    END IF;
    UPDATE public.products p SET stock = p.stock - oi.qty, updated_at = now()
    FROM public.order_items oi WHERE oi.order_id = o.id AND oi.product_id = p.id;
    INSERT INTO public.stock_movements (product_id, delta, reason, order_id)
      SELECT product_id, -qty, 'order', o.id FROM public.order_items WHERE order_id = o.id;
    UPDATE public.orders SET payment_status = 'paid', status = 'processing', paid_at = now() WHERE id = o.id;
  END IF;

  IF o.discount_code IS NOT NULL THEN
    UPDATE public.discounts SET uses = uses + 1 WHERE code = o.discount_code RETURNING uses, max_uses INTO v_uses, v_max;
    IF v_max IS NOT NULL AND v_uses > v_max THEN UPDATE public.orders SET needs_attention = true WHERE id = o.id; END IF;
  END IF;
  RETURN 'paid';
END $$;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid(text, bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(text, bigint) TO service_role;

-- 5) give an expired or cancelled hold's stock back (server only; the server calls this only after Paystack confirms it is not coming)
CREATE OR REPLACE FUNCTION public.release_hold(p_order uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND OR NOT o.stock_held THEN RETURN false; END IF;
  PERFORM 1 FROM public.products WHERE id IN (SELECT product_id FROM public.order_items WHERE order_id = o.id) ORDER BY id FOR UPDATE;
  UPDATE public.products p SET stock = p.stock + oi.qty, updated_at = now()
    FROM public.order_items oi WHERE oi.order_id = o.id AND oi.product_id = p.id;
  INSERT INTO public.stock_movements (product_id, delta, reason, order_id)
    SELECT product_id, qty, 'release', o.id FROM public.order_items WHERE order_id = o.id;
  UPDATE public.orders SET stock_held = false, hold_expires_at = null WHERE id = o.id;
  INSERT INTO public.audit_log (actor, action, entity, entity_id, meta)
    VALUES (null, 'hold_released', 'orders', o.id::text, jsonb_build_object('reason', CASE WHEN o.status = 'cancelled' THEN 'cancelled' ELSE 'expired' END));
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.release_hold(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_hold(uuid) TO service_role;

-- 6) cancelling gives the stock back at once: an unpaid order still holding stock releases its hold; a paid order puts its stock back as before
CREATE OR REPLACE FUNCTION public._restore_stock(p_order uuid, p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order AND stock_held) THEN
    PERFORM public.release_hold(p_order);
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE order_id = p_order AND reason IN ('order','pos'))
     AND NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE order_id = p_order AND reason = 'cancel') THEN
    UPDATE public.products p SET stock = p.stock + oi.qty, updated_at = now()
      FROM public.order_items oi WHERE oi.order_id = p_order AND oi.product_id = p.id;
    INSERT INTO public.stock_movements (product_id, delta, reason, order_id, created_by)
      SELECT product_id, qty, 'cancel', p_order, p_actor FROM public.order_items WHERE order_id = p_order;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public._restore_stock(uuid, uuid) FROM public, anon, authenticated;
