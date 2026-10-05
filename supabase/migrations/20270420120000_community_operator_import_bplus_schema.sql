-- Community operator-import B+ (OWNER-approved 2026-10-05).
-- ADDITIVE ONLY: no table/column drops, no row deletes. Existing drafts / inbox / posts / images preserved.
--   * sources & boards become the runtime SSOT (code registry seeded here, ids unchanged)
--   * board → DIBAY topic mapping (default_topic_id), board kind, collection timestamps
--   * inbox timestamps + quality
--   * source ↔ community_posts link table (1 source article = max 1 post; updates reuse the post)
--   * replacement rules, job queue
--   * community_import_publish RPC: post + images + link + draft + inbox in ONE transaction
--   * new community topics 맛집 / 골프 / 유머 (same contract as Admin topic create)

-- 1. sources -----------------------------------------------------------------------------------
alter table public.community_operator_import_sources
  drop constraint if exists community_operator_import_sources_engine_check;
alter table public.community_operator_import_sources
  add constraint community_operator_import_sources_engine_check
  check (engine in ('gnuboard', 'wordpress_rest', 'rss_atom', 'html'));

alter table public.community_operator_import_sources
  drop constraint if exists community_operator_import_sources_verification_check;
alter table public.community_operator_import_sources
  add constraint community_operator_import_sources_verification_check
  check (verification in ('VERIFIED', 'FULL', 'PARTIAL', 'BLOCKED', 'FAILED', 'NOT_PROVEN', 'REJECT'));

alter table public.community_operator_import_sources
  add column if not exists adapter_config jsonb not null default '{}'::jsonb,
  add column if not exists content_policy text not null default 'summary_link',
  add column if not exists robots_status text null,
  add column if not exists ai_bots_blocked boolean not null default false,
  add column if not exists last_checked_at timestamptz null,
  add column if not exists last_success_at timestamptz null,
  add column if not exists last_failure_at timestamptz null,
  add column if not exists last_error text null,
  add column if not exists consecutive_failures integer not null default 0;

alter table public.community_operator_import_sources
  drop constraint if exists community_operator_import_sources_content_policy_check;
alter table public.community_operator_import_sources
  add constraint community_operator_import_sources_content_policy_check
  check (content_policy in ('full', 'summary_link', 'link_only'));

comment on column public.community_operator_import_sources.content_policy is
  'full = 재게시 허락 확인됨 · summary_link = 요약+대표이미지+원문 링크(기본) · link_only = 제목+링크만';

-- 2. boards ------------------------------------------------------------------------------------
alter table public.community_operator_import_source_boards
  add column if not exists collect_enabled boolean not null default false,
  add column if not exists board_kind text not null default 'unknown',
  add column if not exists default_topic_id uuid null references public.community_topics(id) on delete set null,
  add column if not exists last_checked_at timestamptz null,
  add column if not exists last_success_at timestamptz null,
  add column if not exists last_failure_at timestamptz null,
  add column if not exists last_error text null,
  add column if not exists last_verdict text null,
  add column if not exists latest_source_at timestamptz null,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists locked_until timestamptz null;

alter table public.community_operator_import_source_boards
  drop constraint if exists community_operator_import_source_boards_board_kind_check;
alter table public.community_operator_import_source_boards
  add constraint community_operator_import_source_boards_board_kind_check
  check (board_kind in ('editorial', 'community', 'member_qa', 'directory', 'ads', 'unknown'));

create index if not exists community_operator_import_source_boards_collect_idx
  on public.community_operator_import_source_boards (collect_enabled, last_checked_at nulls first);

-- 3. inbox -------------------------------------------------------------------------------------
alter table public.community_operator_import_inbox
  add column if not exists first_seen_at timestamptz null,
  add column if not exists last_checked_at timestamptz null,
  add column if not exists last_changed_at timestamptz null,
  add column if not exists source_missing_at timestamptz null,
  add column if not exists summary text null,
  add column if not exists quality text null,
  add column if not exists quality_reasons jsonb not null default '[]'::jsonb;

update public.community_operator_import_inbox
set first_seen_at = coalesce(first_seen_at, collected_at),
    last_checked_at = coalesce(last_checked_at, collected_at)
where first_seen_at is null or last_checked_at is null;

alter table public.community_operator_import_inbox alter column first_seen_at set default now();
alter table public.community_operator_import_inbox alter column first_seen_at set not null;

alter table public.community_operator_import_inbox
  drop constraint if exists community_operator_import_inbox_status_check;
alter table public.community_operator_import_inbox
  add constraint community_operator_import_inbox_status_check
  check (status in ('new', 'draft', 'published', 'source_updated', 'failed', 'hidden', 'skipped'));

create index if not exists community_operator_import_inbox_board_seen_idx
  on public.community_operator_import_inbox (source_site, source_board, first_seen_at desc);

-- 4. source ↔ post link ------------------------------------------------------------------------
create table if not exists public.community_import_post_links (
  id uuid primary key default gen_random_uuid(),
  source_site text not null,
  source_board text not null,
  source_article_key text not null,
  post_id uuid not null unique references public.community_posts(id) on delete cascade,
  canonical_url text not null,
  content_hash text not null default '',
  content_policy text not null default 'summary_link',
  published_by uuid null,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_site, source_board, source_article_key)
);
comment on table public.community_import_post_links is
  'Operator-import provenance: one source article ↔ at most one community_posts row.';
alter table public.community_import_post_links enable row level security;

-- 5. replacement rules --------------------------------------------------------------------------
create table if not exists public.community_import_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'global' check (scope in ('global', 'source', 'board')),
  source_site text null,
  source_board text null,
  find_text text not null check (char_length(find_text) between 1 and 500),
  replace_text text not null default '',
  is_regex boolean not null default false,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  note text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope = 'global' or source_site is not null),
  check (scope <> 'board' or source_board is not null)
);
create index if not exists community_import_rules_scope_idx
  on public.community_import_rules (enabled, scope, source_site, source_board, sort_order);
alter table public.community_import_rules enable row level security;

-- 6. jobs ----------------------------------------------------------------------------------------
create table if not exists public.community_import_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('publish', 'update', 'hide', 'unhide', 'reprocess')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  params jsonb not null default '{}'::jsonb,
  total integer not null default 0,
  done_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  created_by uuid null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  locked_until timestamptz null,
  last_error text null
);
create table if not exists public.community_import_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.community_import_jobs(id) on delete cascade,
  source_site text not null,
  source_board text not null,
  source_article_key text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'skipped')),
  message text null,
  post_id uuid null,
  updated_at timestamptz not null default now(),
  unique (job_id, source_site, source_board, source_article_key)
);
create index if not exists community_import_job_items_pending_idx
  on public.community_import_job_items (job_id, status);
alter table public.community_import_jobs enable row level security;
alter table public.community_import_job_items enable row level security;

revoke all on public.community_import_post_links, public.community_import_rules,
  public.community_import_jobs, public.community_import_job_items from anon, authenticated;

-- 7. topics (Admin topic contract: not feed-sort, no meetup, compact_media skin) ----------------
insert into public.community_topics
  (section_id, name, name_en, slug, sort_order, is_active, is_visible, is_feed_sort, feed_sort_mode,
   allow_question, allow_meetup, feed_list_skin)
select s.id, v.name, v.name_en, v.slug, v.sort_order, true, true, false, null, true, false, 'compact_media'
from public.community_sections s
cross join (values ('맛집', 'Food', 'food', 8), ('골프', 'Golf', 'golf', 9), ('유머', 'Humor', 'humor', 10))
  as v(name, name_en, slug, sort_order)
where s.slug = 'dongnae'
  and not exists (select 1 from public.community_topics t where t.section_id = s.id and t.slug = v.slug);

