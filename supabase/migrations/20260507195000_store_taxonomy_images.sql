-- Store taxonomy images (admin managed)
-- - Adds image_url columns to store_categories/store_topics
-- - Creates a public bucket for taxonomy images

alter table public.store_categories
  add column if not exists image_url text;

alter table public.store_topics
  add column if not exists image_url text;

comment on column public.store_categories.image_url is 'Public image URL for primary store category (admin-managed).';
comment on column public.store_topics.image_url is 'Public image URL for secondary store topic (admin-managed).';

-- Storage bucket (public read): store taxonomy images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-taxonomy-images',
  'store-taxonomy-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

