-- STEP 2: Community crawl registry SSOT
-- Depends on: community_topics, community_posts (STEP1 origin columns optional for this migration)

CREATE TABLE IF NOT EXISTS public.community_crawl_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_url text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED')),
  crawler_type text NOT NULL DEFAULT 'generic_html'
    CHECK (crawler_type IN ('generic_html', 'custom_adapter')),
  adapter_key text,
  policy_status text NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (policy_status IN ('ALLOWED', 'REVIEW_REQUIRED', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_crawl_sources_status_idx
  ON public.community_crawl_sources (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.community_crawl_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.community_crawl_sources (id) ON DELETE CASCADE,
  name text NOT NULL,
  list_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  dibay_topic_id uuid NOT NULL REFERENCES public.community_topics (id) ON DELETE RESTRICT,
  crawl_mode text NOT NULL DEFAULT 'generic_html'
    CHECK (crawl_mode IN ('generic_html', 'custom_adapter')),
  adapter_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  update_policy text NOT NULL DEFAULT 'CREATE_ONLY'
    CHECK (update_policy IN ('CREATE_ONLY', 'SYNC_UPDATE')),
  author_policy text NOT NULL DEFAULT 'SOURCE_AUTHOR'
    CHECK (author_policy IN ('SOURCE_AUTHOR', 'FIXED', 'RANDOM_POOL')),
  author_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  date_policy text NOT NULL DEFAULT 'SOURCE_DATE'
    CHECK (date_policy IN ('SOURCE_DATE', 'IMPORT_DATE', 'RANDOM_RANGE')),
  date_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  view_policy text NOT NULL DEFAULT 'SOURCE_VIEW'
    CHECK (view_policy IN ('SOURCE_VIEW', 'FIXED', 'RANDOM_RANGE')),
  view_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_enabled boolean NOT NULL DEFAULT false,
  crawl_interval_minutes integer
    CHECK (
      crawl_interval_minutes IS NULL
      OR crawl_interval_minutes IN (30, 60, 180, 360, 720, 1440)
    ),
  next_run_at timestamptz,
  max_pages integer NOT NULL DEFAULT 3 CHECK (max_pages > 0 AND max_pages <= 50),
  max_posts integer NOT NULL DEFAULT 20 CHECK (max_posts > 0 AND max_posts <= 200),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_crawl_boards_source_idx
  ON public.community_crawl_boards (source_id, enabled);
CREATE INDEX IF NOT EXISTS community_crawl_boards_topic_idx
  ON public.community_crawl_boards (dibay_topic_id);
CREATE INDEX IF NOT EXISTS community_crawl_boards_due_idx
  ON public.community_crawl_boards (schedule_enabled, next_run_at)
  WHERE schedule_enabled = true;

CREATE TABLE IF NOT EXISTS public.community_crawl_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.community_crawl_boards (id) ON DELETE CASCADE,
  run_kind text NOT NULL CHECK (run_kind IN ('TEST', 'MANUAL', 'SCHEDULED')),
  status text NOT NULL DEFAULT 'RUNNING'
    CHECK (status IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  fetched_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text
);

CREATE INDEX IF NOT EXISTS community_crawl_runs_board_started_idx
  ON public.community_crawl_runs (board_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.community_crawl_post_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.community_crawl_boards (id) ON DELETE CASCADE,
  source_post_id text,
  canonical_url text,
  community_post_id uuid REFERENCES public.community_posts (id) ON DELETE SET NULL,
  source_published_at timestamptz,
  manual_override boolean NOT NULL DEFAULT false,
  source_status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (source_status IN ('ACTIVE', 'SOURCE_MISSING')),
  last_seen_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_crawl_post_links_identity_check CHECK (
    (source_post_id IS NOT NULL AND length(trim(source_post_id)) > 0)
    OR (canonical_url IS NOT NULL AND length(trim(canonical_url)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS community_crawl_post_links_board_source_post_uidx
  ON public.community_crawl_post_links (board_id, source_post_id)
  WHERE source_post_id IS NOT NULL AND length(trim(source_post_id)) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS community_crawl_post_links_board_canonical_url_uidx
  ON public.community_crawl_post_links (board_id, canonical_url)
  WHERE canonical_url IS NOT NULL AND length(trim(canonical_url)) > 0;

CREATE INDEX IF NOT EXISTS community_crawl_post_links_community_post_idx
  ON public.community_crawl_post_links (community_post_id)
  WHERE community_post_id IS NOT NULL;

ALTER TABLE public.community_crawl_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_crawl_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_crawl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_crawl_post_links ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.community_crawl_sources IS
  'Community crawl SOURCE SSOT — external site registry (Admin Community only).';
COMMENT ON TABLE public.community_crawl_boards IS
  'Community crawl BOARD/PAGE SSOT — per-list-url operational unit → dibay_topic_id.';
COMMENT ON TABLE public.community_crawl_runs IS
  'Community crawl RUN SSOT — TEST|MANUAL|SCHEDULED execution history.';
COMMENT ON TABLE public.community_crawl_post_links IS
  'Community crawl POST LINK SSOT — external identity ↔ community_posts; DB unique dedupe authority.';
