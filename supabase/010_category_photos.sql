-- Run AFTER 009.
-- An optional photo for each category (uploaded in the team area, not typed in as a link — same pattern as the CEO photo).
-- No new access rules are needed: category rows are already admin-only to write (006_least_privilege.sql, categories_admin policy).
alter table public.categories
  add column if not exists image_url text check (image_url is null or char_length(image_url) <= 500);
