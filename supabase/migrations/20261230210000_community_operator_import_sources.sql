-- Fresh operator-import managed sources + boards (Admin persistent registry).
-- Complements code seed registry; does NOT resurrect OLD crawler builder tables.

create table if not exists public.community_operator_import_sources (
  id text primary key,
  display_name text not null,
  base_url text not null,
  engine text not null
    check (engine in ('gnuboard', 'wordpress_rest', 'rss_atom')),
  verification text not null
    check (verification in ('VERIFIED', 'PARTIAL', 'BLOCKED', 'NOT_PROVEN', 'REJECT')),
  enabled boolean not null default false,
  priority text not null default 'P1'
    check (priority in ('P0', 'P1', 'P2')),
  origin text not null default 'admin'
    check (origin in ('seed', 'admin')),
  verify_json jsonb not null default '{}'::jsonb,
  reason text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_operator_import_source_boards (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.community_operator_import_sources(id) on delete cascade,
  board_id text not null,
  display_name text not null,
  short_label text not null default '',
  category text not null default 'living',
  engine_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, board_id)
);

create index if not exists community_operator_import_sources_enabled_idx
  on public.community_operator_import_sources (enabled, updated_at desc);

create index if not exists community_operator_import_source_boards_source_idx
  on public.community_operator_import_source_boards (source_id, enabled);

comment on table public.community_operator_import_sources is
  'Fresh operator-import Admin-managed sources. Active runtime only when enabled and verification allows.';

comment on table public.community_operator_import_source_boards is
  'Boards/categories for managed sources. No DOM selector builder fields.';

alter table public.community_operator_import_sources enable row level security;
alter table public.community_operator_import_source_boards enable row level security;
