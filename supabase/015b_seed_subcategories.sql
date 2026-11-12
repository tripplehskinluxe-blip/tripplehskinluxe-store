-- OPTIONAL. Run AFTER 015. Fills in the starting lists you described, only for categories whose web address
-- (slug) is skincare / skin-care and haircare / hair-care. A category that is not found is simply skipped, nothing else
-- is touched, and running it twice never creates duplicates. Everything can be edited afterwards in Admin > Categories.
do $$
declare s uuid; h uuid;
begin
  select id into s from public.categories where slug in ('skincare', 'skin-care') order by slug limit 1;
  select id into h from public.categories where slug in ('haircare', 'hair-care') order by slug limit 1;
  if s is not null then
    insert into public.subcategories (category_id, name, group_name, slug, sort) values
      (s, 'Body Washes',  'Body Care', 'body-washes',  1),
      (s, 'Body Lotions', 'Body Care', 'body-lotions', 2),
      (s, 'Body Scrubs',  'Body Care', 'body-scrubs',  3),
      (s, 'Cleansers',    'Face',      'cleansers',    4),
      (s, 'Toners',       'Face',      'toners',       5),
      (s, 'Serums',       'Face',      'serums',       6),
      (s, 'Treatments',   'Face',      'treatments',   7),
      (s, 'Moisturisers', 'Face',      'moisturisers', 8),
      (s, 'Sunscreen',    'Face',      'sunscreen',    9),
      (s, 'Masks',        'Face',      'masks',       10),
      (s, 'Lip Mask',     'Lip',       'lip-mask',    11),
      (s, 'Lip Balm',     'Lip',       'lip-balm',    12)
    on conflict do nothing;
  end if;
  if h is not null then
    insert into public.subcategories (category_id, name, group_name, slug, sort) values
      (h, 'Shampoo',         null, 'shampoo',         1),
      (h, 'Conditioners',    null, 'conditioners',    2),
      (h, 'Hair Treatments', null, 'hair-treatments', 3)
    on conflict do nothing;
  end if;
end $$;
