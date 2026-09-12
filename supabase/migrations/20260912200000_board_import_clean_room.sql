-- DIBAY community board import (clean-room) — P0 uniqueness
-- Authority: lib/community-board-import/* (not legacy community_crawl_*)

CREATE TABLE IF NOT EXISTS public.board_import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name text NOT NULL,
  source_board_name text NOT NULL,
  source_url text NOT NULL,
  site_key text NOT NULL,
  board_key text NOT NULL,
  target_topic_id uuid NULL,
  mode text NOT NULL DEFAULT 'MANUAL' CHECK (mode IN ('MANUAL', 'AUTO')),
  check_status text NULL CHECK (check_status IN ('READY', 'PARTIAL', 'UNSUPPORTED')),
  check_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  author_pool_id uuid NULL,
  date_recent_min_days int NOT NULL DEFAULT 3,
  date_recent_max_days int NOT NULL DEFAULT 10,
  view_seed_min int NOT NULL DEFAULT 100,
  view_seed_max int NOT NULL DEFAULT 500,
  last_checked_at timestamptz NULL,
  last_fetched_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_import_sources_identity_uidx UNIQUE (site_key, board_key)
);

CREATE TABLE IF NOT EXISTS public.board_import_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_board_id uuid NOT NULL REFERENCES public.board_import_sources(id) ON DELETE CASCADE,
  stable_article_identity text NOT NULL,
  identity_kind text NOT NULL CHECK (identity_kind IN ('stable_id', 'canonical_url', 'normalized_url')),
  content_fingerprint text NOT NULL,
  canonical_source_url text NOT NULL,
  source_title text NOT NULL DEFAULT '',
  source_document jsonb NOT NULL DEFAULT '{"title":"","nodes":[],"canonicalUrl":""}'::jsonb,
  source_author text NULL,
  source_date_iso text NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  source_changed_at timestamptz NULL,
  published_post_id uuid NULL,
  failure_stage text NULL,
  failure_code text NULL,
  failure_message text NULL,
  failed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_import_articles_identity_uidx UNIQUE (source_board_id, stable_article_identity)
);

-- One Community post may be linked from at most one source article.
CREATE UNIQUE INDEX IF NOT EXISTS board_import_articles_published_post_uidx
  ON public.board_import_articles (published_post_id)
  WHERE published_post_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.board_import_replacement_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_board_id uuid NOT NULL REFERENCES public.board_import_sources(id) ON DELETE CASCADE,
  from_text text NOT NULL,
  to_text text NOT NULL DEFAULT '',
  apply_title boolean NOT NULL DEFAULT true,
  apply_body boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_import_articles_board_idx
  ON public.board_import_articles (source_board_id, last_seen_at DESC);

COMMENT ON TABLE public.board_import_sources IS 'Clean-room external SOURCE BOARD registry (P0 unique site_key+board_key)';
COMMENT ON TABLE public.board_import_articles IS 'Clean-room SOURCE ARTICLE snapshots (P0 unique board+stable_article_identity; max one published_post)';
