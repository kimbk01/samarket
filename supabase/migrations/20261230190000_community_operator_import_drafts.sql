-- Fresh PHASE E minimal draft persistence for Community Operator Import.
-- NOT a resurrection of deleted external_* / board_import_* / community_crawl_* product tables.
-- Holds Admin draft + provenance only. Public posts remain normal community_posts.

create table if not exists public.community_operator_import_drafts (
  id uuid primary key default gen_random_uuid(),
  source_site text not null,
  source_board text not null,
  source_article_key text not null,
  canonical_url text not null,
  original_json jsonb not null,
  edit_json jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  published_post_id uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_site, source_board, source_article_key)
);

create index if not exists community_operator_import_drafts_status_idx
  on public.community_operator_import_drafts (status, updated_at desc);

comment on table public.community_operator_import_drafts is
  'PHASE E Fresh operator-import drafts (Admin only). Not OLD external_import product.';

alter table public.community_operator_import_drafts enable row level security;

-- Service-role / admin API writes; no public member policies.
