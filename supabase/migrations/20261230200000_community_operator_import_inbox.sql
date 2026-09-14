-- Fresh operator-import durable inbox (collected articles + state).
-- Not OLD external_import / crawl job tables.

create table if not exists public.community_operator_import_inbox (
  id uuid primary key default gen_random_uuid(),
  source_site text not null,
  source_board text not null,
  source_article_key text not null,
  canonical_url text not null,
  title text not null default '',
  author text null,
  source_published_at text null,
  thumbnail_url text null,
  fingerprint text not null default '',
  status text not null default 'new'
    check (status in ('new', 'draft', 'published', 'source_updated', 'failed')),
  published_post_id uuid null,
  last_error text null,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_site, source_board, source_article_key)
);

create index if not exists community_operator_import_inbox_board_idx
  on public.community_operator_import_inbox (source_site, source_board, collected_at desc);

create index if not exists community_operator_import_inbox_status_idx
  on public.community_operator_import_inbox (status, updated_at desc);

comment on table public.community_operator_import_inbox is
  'Fresh operator-import durable inbox rows (Admin only).';

alter table public.community_operator_import_inbox enable row level security;
