-- CUT product: publish link + auth session SSOT (additive on Production DB)
-- Ordering after 20261230150000

create table if not exists public.external_publish_links (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.external_articles(id) on delete cascade,
  community_post_id uuid null,
  community_topic_id uuid null,
  status text not null default 'never_published'
    check (status in ('never_published', 'published', 'deleted', 'republish_allowed')),
  published_at timestamptz null,
  deleted_at timestamptz null,
  republish_allowed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id)
);

create index if not exists external_publish_links_post_idx
  on public.external_publish_links (community_post_id)
  where community_post_id is not null;

create table if not exists public.external_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.external_sites(id) on delete cascade,
  label text not null default 'default',
  status text not null default 'missing'
    check (status in ('missing', 'active', 'expired')),
  storage_state jsonb not null default '{}'::jsonb,
  notes text null,
  last_verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, label)
);

-- draft document for Admin edits (source_document remains on external_article_documents)
alter table public.external_article_documents
  add column if not exists draft_document jsonb null;
