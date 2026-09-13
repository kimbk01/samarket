-- DIBAY external-board-import (NEW clean-room)
-- Zero-base. Does NOT alter board_import_* or community_crawl_*.

CREATE TABLE IF NOT EXISTS public.external_board_author_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_board_author_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.external_board_author_pools(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_board_author_aliases_pool_idx
  ON public.external_board_author_aliases (pool_id);

CREATE TABLE IF NOT EXISTS public.external_board_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name text NOT NULL,
  source_board_name text NOT NULL,
  source_url text NOT NULL,
  site_key text NOT NULL,
  board_key text NOT NULL,
  target_topic_id uuid NULL,
  target_topic_slug text NULL,
  target_location_id uuid NULL,
  target_region_label text NULL,
  mode text NOT NULL DEFAULT 'MANUAL' CHECK (mode IN ('MANUAL', 'AUTO')),
  check_status text NULL CHECK (check_status IN ('READY', 'PARTIAL', 'UNSUPPORTED')),
  check_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  rights_basis text NULL,
  rights_status text NOT NULL DEFAULT 'missing'
    CHECK (rights_status IN ('missing', 'declared', 'rejected')),
  author_pool_id uuid NULL REFERENCES public.external_board_author_pools(id) ON DELETE SET NULL,
  date_recent_min_days int NOT NULL DEFAULT 3,
  date_recent_max_days int NOT NULL DEFAULT 10,
  view_seed_min int NOT NULL DEFAULT 100,
  view_seed_max int NOT NULL DEFAULT 500,
  last_checked_at timestamptz NULL,
  last_fetched_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_board_sources_identity_uidx UNIQUE (site_key, board_key)
);

CREATE TABLE IF NOT EXISTS public.external_board_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.external_board_sources(id) ON DELETE CASCADE,
  stable_article_identity text NOT NULL,
  identity_kind text NOT NULL CHECK (identity_kind IN ('stable_id', 'canonical_url', 'normalized_url')),
  content_fingerprint text NOT NULL DEFAULT '',
  canonical_source_url text NOT NULL,
  source_title text NOT NULL DEFAULT '',
  source_document jsonb NOT NULL DEFAULT '{"title":"","canonicalUrl":"","nodes":[]}'::jsonb,
  source_author text NULL,
  source_published_at timestamptz NULL,
  snapshot_version int NOT NULL DEFAULT 0,
  ops_status text NOT NULL DEFAULT 'unpublished'
    CHECK (ops_status IN ('unpublished', 'published', 'failed')),
  article_signal text NULL
    CHECK (article_signal IS NULL OR article_signal IN ('NEW', 'UNCHANGED', 'SOURCE_UPDATED', 'SAME_PUBLISHED')),
  published_post_id uuid NULL,
  failure_stage text NULL,
  failure_code text NULL,
  failure_message text NULL,
  failed_at timestamptz NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  source_changed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_board_articles_identity_uidx UNIQUE (source_id, stable_article_identity)
);

CREATE UNIQUE INDEX IF NOT EXISTS external_board_articles_published_post_uidx
  ON public.external_board_articles (published_post_id)
  WHERE published_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS external_board_articles_source_idx
  ON public.external_board_articles (source_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.external_board_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.external_board_articles(id) ON DELETE CASCADE,
  source_media_identity text NOT NULL,
  source_url text NOT NULL,
  dibay_storage_path text NULL,
  dibay_storage_url text NULL,
  content_type text NULL,
  byte_size int NULL,
  fetch_status text NOT NULL DEFAULT 'pending'
    CHECK (fetch_status IN ('pending', 'ok', 'failed')),
  failure_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_board_media_assets_uidx UNIQUE (article_id, source_media_identity)
);

CREATE TABLE IF NOT EXISTS public.external_board_replacement_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.external_board_sources(id) ON DELETE CASCADE,
  from_text text NOT NULL,
  to_text text NOT NULL DEFAULT '',
  apply_title boolean NOT NULL DEFAULT true,
  apply_body boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_board_replacement_rules_source_idx
  ON public.external_board_replacement_rules (source_id, priority);

CREATE TABLE IF NOT EXISTS public.external_board_publish_claims (
  article_id uuid PRIMARY KEY REFERENCES public.external_board_articles(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  claimed_by text NOT NULL DEFAULT 'publisher',
  expires_at timestamptz NOT NULL
);

COMMENT ON TABLE public.external_board_sources IS
  'NEW clean-room external SOURCE BOARD registry (site_key+board_key unique).';
COMMENT ON TABLE public.external_board_articles IS
  'NEW clean-room SOURCE ARTICLE snapshots; max one community_posts via published_post_id.';
COMMENT ON COLUMN public.external_board_articles.source_published_at IS
  'Source/audit clock only. Never used as community_posts.created_at.';
