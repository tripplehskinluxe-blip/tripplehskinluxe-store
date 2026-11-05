-- Run AFTER 013. Product reviews from people who really received the product.
--   * a review is written through a private link that only the buyer gets (in the "delivered" email, or from the tracking page);
--   * only a PAID, DELIVERED online order can review, only the products in it, ONE review per product per order;
--   * reviews appear straight away, no approval. Any staff member can REMOVE one (it is hidden and logged, not erased, so a mistake can be undone);
--   * nobody can write a review directly into the table from a browser any more; only the website's server can;
--   * the star average on each product updates by itself (that part already existed).
-- Safe to run more than once.

alter table public.reviews
  add column if not exists order_id   uuid references public.orders(id) on delete set null,
  add column if not exists removed_by uuid references auth.users(id) on delete set null,
  add column if not exists removed_at timestamptz;
alter table public.reviews alter column status set default 'published';
alter table public.reviews drop constraint if exists reviews_body_len;
alter table public.reviews add  constraint reviews_body_len check (char_length(body) <= 1000) not valid;       -- new rows only; any older longer review stays as it was
create unique index if not exists reviews_one_per_order_product on public.reviews (order_id, product_id) where order_id is not null;

-- 1) close the old door: no browser may insert a review, and the only column a team member may change is the status
drop policy if exists reviews_insert on public.reviews;
revoke insert on public.reviews from authenticated;
revoke update on public.reviews from authenticated;
grant  update (status) on public.reviews to authenticated;
drop policy if exists reviews_staff_status on public.reviews;
create policy reviews_staff_status on public.reviews for update to authenticated
  using (public.is_staff()) with check (public.is_staff() and status in ('published','hidden'));

-- removing / restoring leaves a trail: who, when
create or replace function public.reviews_track_removal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and auth.uid() is not null then
    if new.status = 'hidden' then new.removed_by := auth.uid(); new.removed_at := now();
    elsif new.status = 'published' then new.removed_by := null; new.removed_at := null; end if;
    insert into public.audit_log (actor, action, entity, entity_id, meta)
    values (auth.uid(), case when new.status = 'hidden' then 'review_remove' else 'review_restore' end, 'reviews', new.id::text,
            jsonb_build_object('product', new.product_id, 'rating', new.rating));
  end if;
  return new;
end $$;
revoke execute on function public.reviews_track_removal() from public, anon, authenticated;
drop trigger if exists reviews_track_removal on public.reviews;
create trigger reviews_track_removal before update of status on public.reviews for each row execute function public.reviews_track_removal();

-- 2) the private review links. Only a fingerprint (hash) of each link is stored, and only the server can touch the table.
create table if not exists public.review_tokens (
  token_hash text primary key,
  order_id   uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create index if not exists review_tokens_order_idx on public.review_tokens (order_id, created_at);
alter table public.review_tokens enable row level security;
revoke all on public.review_tokens from public, anon, authenticated;
grant  all on public.review_tokens to service_role;

-- a link for a PAID, DELIVERED online order; at most 5 live links per order
create or replace function public.issue_review_token(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare o public.orders; v text;
begin
  select * into o from public.orders where id = p_order;
  if not found or o.channel <> 'online' or o.status <> 'delivered' or o.payment_status <> 'paid' then return null; end if;
  v := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');          -- 64 hex characters from a secure source
  insert into public.review_tokens (token_hash, order_id) values (encode(sha256(convert_to(v, 'UTF8')), 'hex'), p_order);
  delete from public.review_tokens where order_id = p_order and (expires_at < now()
    or token_hash not in (select token_hash from public.review_tokens where order_id = p_order order by created_at desc limit 5));
  return v;
end $$;
revoke execute on function public.issue_review_token(uuid) from public, anon, authenticated;
grant  execute on function public.issue_review_token(uuid) to service_role;

-- what the review page shows for a link
create or replace function public.review_context(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select t.order_id, o.order_number, o.customer_name into r
    from public.review_tokens t join public.orders o on o.id = t.order_id
   where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and t.expires_at > now()
     and o.status = 'delivered' and o.payment_status = 'paid' and o.channel = 'online';
  if not found then return jsonb_build_object('code', 'invalid'); end if;
  return jsonb_build_object('code', 'ok', 'order_number', r.order_number, 'first_name', split_part(trim(r.customer_name), ' ', 1),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('product_id', oi.product_id, 'name', oi.name, 'slug', p.slug,
                'reviewed', exists (select 1 from public.reviews rv where rv.order_id = r.order_id and rv.product_id = oi.product_id)) order by oi.name), '[]'::jsonb)
                from public.order_items oi left join public.products p on p.id = oi.product_id
               where oi.order_id = r.order_id and oi.product_id is not null));
end $$;
revoke execute on function public.review_context(text) from public, anon, authenticated;
grant  execute on function public.review_context(text) to service_role;

-- writing a review: the link proves the purchase; everything else is checked here
create or replace function public.submit_review(p_token text, p_product uuid, p_rating integer, p_name text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_name text := trim(coalesce(p_name, '')); v_body text := trim(coalesce(p_body, ''));
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 or char_length(v_name) < 1 or char_length(v_name) > 40 or char_length(v_body) > 1000 then
    return jsonb_build_object('code', 'bad_input');
  end if;
  if v_name ~* '(https?://|www\.)' or v_body ~* '(https?://|www\.)' then return jsonb_build_object('code', 'no_links'); end if;
  select t.order_id into r
    from public.review_tokens t join public.orders o on o.id = t.order_id
   where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and t.expires_at > now()
     and o.status = 'delivered' and o.payment_status = 'paid' and o.channel = 'online';
  if not found then return jsonb_build_object('code', 'invalid'); end if;
  if not exists (select 1 from public.order_items where order_id = r.order_id and product_id = p_product) then return jsonb_build_object('code', 'not_in_order'); end if;
  begin
    insert into public.reviews (product_id, order_id, name, rating, body, status) values (p_product, r.order_id, v_name, p_rating, v_body, 'published');
  exception when unique_violation then
    return jsonb_build_object('code', 'already');
  end;
  return jsonb_build_object('code', 'ok');
end $$;
revoke execute on function public.submit_review(text, uuid, integer, text, text) from public, anon, authenticated;
grant  execute on function public.submit_review(text, uuid, integer, text, text) to service_role;
