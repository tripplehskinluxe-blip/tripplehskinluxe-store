-- Run AFTER 003. Product photo storage: anyone can VIEW photos; only a two-factor-verified admin can upload or delete.
-- Limits: 3 MB per image, JPEG/PNG/WebP only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy "product images are public"  on storage.objects for select using (bucket_id = 'products');
create policy "admins upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'products' and public.is_admin());
create policy "admins update product images" on storage.objects for update to authenticated using (bucket_id = 'products' and public.is_admin()) with check (bucket_id = 'products' and public.is_admin());
create policy "admins delete product images" on storage.objects for delete to authenticated using (bucket_id = 'products' and public.is_admin());
