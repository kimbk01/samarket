-- DIBAY external-import (Crawlee foundation) product SSOT
-- Ordering: MUST be after 20261230140000 (renamed from mistaken 20260314).
-- Crawlee RequestQueue/SessionPool are runtime helpers only; these tables are authority.
-- CUT 2 scope: jobs/sites/boards/articles/documents only (no publish_links / auth_sessions).

create table if not exists public.external_sites (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  site_key text not null,
  name text not null,
  base_url text not null,
  engine text not null check (engine in ('cheerio', 'playwright')),
  adapter_key text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_key)
);

create table if not exists public.external_boards (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.external_sites(id) on delete cascade,
  board_key text not null,
  name text not null,
  list_url text not null,
  topic_hint text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, board_key)
);

create table if not exists public.external_articles (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.external_sites(id) on delete cascade,
  board_id uuid not null references public.external_boards(id) on delete cascade,
  external_article_key text not null,
  canonical_url text not null,
  title text not null default '',
  author text null,
  published_at timestamptz null,
  thumbnail_candidate text null,
  list_page int null,
  list_fetched_at timestamptz null,
  detail_fetched_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, board_id, external_article_key)
);

create table if not exists public.external_article_documents (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.external_articles(id) on delete cascade,
  title text not null default '',
  author text null,
  published_at timestamptz null,
  canonical_url text not null default '',
  source_document jsonb not null default '{}'::jsonb,
  body_html text not null default '',
  body_text text not null default '',
  thumbnail_url text null,
  body_image_urls jsonb not null default '[]'::jsonb,
  gallery_image_urls jsonb not null default '[]'::jsonb,
  media_meta jsonb not null default '{}'::jsonb,
  nodes jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id)
);

create table if not exists public.external_import_jobs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid null references public.external_sites(id) on delete set null,
  board_id uuid null references public.external_boards(id) on delete set null,
  action text not null check (action in ('list', 'detail')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  error text null,
  claimed_by text null,
  claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists external_import_jobs_status_created_idx
  on public.external_import_jobs (status, created_at);

create index if not exists external_articles_board_fetched_idx
  on public.external_articles (board_id, list_fetched_at desc);
