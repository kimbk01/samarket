-- 3차 업종: store_topics(2차) 하위
create table if not exists public.store_subtopics (
  id uuid primary key default gen_random_uuid(),
  store_topic_id uuid not null references public.store_topics(id) on delete cascade,
  name text not null,
  name_en text,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists store_subtopics_slug_uniq on public.store_subtopics (slug);
create index if not exists store_subtopics_topic_sort_idx on public.store_subtopics (store_topic_id, sort_order);
create index if not exists store_subtopics_active_idx on public.store_subtopics (is_active);

comment on table public.store_subtopics is 'Tertiary store taxonomy under store_topics (admin-managed).';
comment on column public.store_subtopics.image_url is 'Public image URL for tertiary store subtopic (admin-managed).';

drop trigger if exists trg_store_subtopics_updated_at on public.store_subtopics;
create trigger trg_store_subtopics_updated_at
before update on public.store_subtopics
for each row
execute function public.set_updated_at();
