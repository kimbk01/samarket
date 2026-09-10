-- Community crawl durable ingestion dataset (operational SSOT)
-- Not Community Feed SSOT. Feed remains community_posts only.
-- SOURCE → BOARD → RUN → ITEM → (optional) POST LINK → community_posts

CREATE TABLE IF NOT EXISTS public.community_crawl_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.community_crawl_sources (id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES public.community_crawl_boards (id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.community_crawl_runs (id) ON DELETE SET NULL,

  source_post_id text,
  canonical_url text NOT NULL,

  source_title text NOT NULL DEFAULT '',
  source_body_normalized text NOT NULL DEFAULT '',
  source_author text,
  source_published_at timestamptz,
  source_cover_url text,
  source_body_images jsonb NOT NULL DEFAULT '[]'::jsonb,

  content_fingerprint text NOT NULL DEFAULT '',

  -- DIBAY display fields: assigned ONCE at item insert, persisted (not re-derived on read)
  display_author_name text,
  display_author_avatar_url text,
  display_date timestamptz,
  display_view_seed integer NOT NULL DEFAULT 0,

  -- Editable DIBAY draft (defaults from source on create)
  dibay_title text NOT NULL DEFAULT '',
  dibay_body text NOT NULL DEFAULT '',
  target_topic_id uuid NOT NULL REFERENCES public.community_topics (id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'DISCOVERED'
    CHECK (status IN (
      'DISCOVERED',
      'READY',
      'REVIEW_REQUIRED',
      'PUBLISHED',
      'FAILED',
      'SKIPPED',
      'SOURCE_MISSING'
    )),

  manual_override boolean NOT NULL DEFAULT false,
  published_post_id uuid REFERENCES public.community_posts (id) ON DELETE SET NULL,

  error_code text,
  error_message text,

  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_crawled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT community_crawl_items_identity_check CHECK (
    (source_post_id IS NOT NULL AND length(trim(source_post_id)) > 0)
    OR (canonical_url IS NOT NULL AND length(trim(canonical_url)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS community_crawl_items_board_source_post_uidx
  ON public.community_crawl_items (board_id, source_post_id)
  WHERE source_post_id IS NOT NULL AND length(trim(source_post_id)) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS community_crawl_items_board_canonical_url_uidx
  ON public.community_crawl_items (board_id, canonical_url);

CREATE INDEX IF NOT EXISTS community_crawl_items_board_status_idx
  ON public.community_crawl_items (board_id, status, last_crawled_at DESC);

CREATE INDEX IF NOT EXISTS community_crawl_items_source_idx
  ON public.community_crawl_items (source_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS community_crawl_items_published_post_idx
  ON public.community_crawl_items (published_post_id)
  WHERE published_post_id IS NOT NULL;

ALTER TABLE public.community_crawl_items ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.community_crawl_items IS
  'Community crawl ITEM/DATASET SSOT — durable ingestion queue for Admin review/publish. Not Feed authority.';

-- Board ingest publish intent (operational; Source policy still gates AUTO_PUBLISH)
ALTER TABLE public.community_crawl_boards
  ADD COLUMN IF NOT EXISTS ingest_mode text NOT NULL DEFAULT 'REVIEW_THEN_PUBLISH';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_crawl_boards_ingest_mode_check'
      AND conrelid = 'public.community_crawl_boards'::regclass
  ) THEN
    ALTER TABLE public.community_crawl_boards
      ADD CONSTRAINT community_crawl_boards_ingest_mode_check
      CHECK (ingest_mode IN ('COLLECT_ONLY', 'REVIEW_THEN_PUBLISH', 'AUTO_PUBLISH'));
  END IF;
END $$;

COMMENT ON COLUMN public.community_crawl_boards.ingest_mode IS
  'COLLECT_ONLY | REVIEW_THEN_PUBLISH | AUTO_PUBLISH. AUTO_PUBLISH requires source.policy_status=ALLOWED.';
