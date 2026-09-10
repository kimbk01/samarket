-- PHASE A/B schema freeze (Owner ACK):
-- 1) community_crawl_run_events = per-URL / per-phase detail SSOT
-- 2) community_crawl_sources.media_policy separate from policy_status (content)
--
-- community_crawl_runs remains aggregate summary SSOT.
-- Do NOT invent a second Feed table or publish writer here.
-- Rehost / community_post_images writer = PHASE C (not this migration).

-- ---------------------------------------------------------------------------
-- Media policy (content policy stays policy_status)
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_crawl_sources
  ADD COLUMN IF NOT EXISTS media_policy text NOT NULL DEFAULT 'MEDIA_REVIEW_REQUIRED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_crawl_sources_media_policy_check'
      AND conrelid = 'public.community_crawl_sources'::regclass
  ) THEN
    ALTER TABLE public.community_crawl_sources
      ADD CONSTRAINT community_crawl_sources_media_policy_check
      CHECK (media_policy IN ('MEDIA_REVIEW_REQUIRED', 'MEDIA_ALLOWED', 'MEDIA_DISABLED'));
  END IF;
END $$;

COMMENT ON COLUMN public.community_crawl_sources.media_policy IS
  'MEDIA_REVIEW_REQUIRED | MEDIA_ALLOWED | MEDIA_DISABLED. Rehost only when MEDIA_ALLOWED. Independent of policy_status (content).';

COMMENT ON COLUMN public.community_crawl_sources.policy_status IS
  'Content reuse policy: ALLOWED | REVIEW_REQUIRED | DISABLED. Does not imply media rehost permission.';

-- Travel Philippines current: content REVIEW_REQUIRED, media MEDIA_REVIEW_REQUIRED
UPDATE public.community_crawl_sources
SET media_policy = 'MEDIA_REVIEW_REQUIRED'
WHERE adapter_key = 'travel_philippines'
  AND (media_policy IS NULL OR media_policy = 'MEDIA_REVIEW_REQUIRED');

-- ---------------------------------------------------------------------------
-- Run events (detail SSOT)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_crawl_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.community_crawl_runs (id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.community_crawl_sources (id) ON DELETE SET NULL,
  board_id uuid NOT NULL REFERENCES public.community_crawl_boards (id) ON DELETE CASCADE,
  source_post_id text,
  canonical_url text,
  phase text NOT NULL,
  classification text NOT NULL,
  error_code text,
  error_message text,
  http_status integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_crawl_run_events_classification_check CHECK (
    classification IN (
      'SKIPPED_INVALID',
      'FAILED',
      'MEDIA_INVALID',
      'PUBLISH_BLOCKED_POLICY',
      'DUPLICATE',
      'INSERTED',
      'UPDATED'
    )
  )
);

CREATE INDEX IF NOT EXISTS community_crawl_run_events_run_idx
  ON public.community_crawl_run_events (run_id, created_at ASC);

CREATE INDEX IF NOT EXISTS community_crawl_run_events_board_class_idx
  ON public.community_crawl_run_events (board_id, classification, created_at DESC);

CREATE INDEX IF NOT EXISTS community_crawl_run_events_url_idx
  ON public.community_crawl_run_events (board_id, canonical_url)
  WHERE canonical_url IS NOT NULL;

ALTER TABLE public.community_crawl_run_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.community_crawl_run_events IS
  'Per-URL / per-phase crawl run detail. Aggregate counts stay on community_crawl_runs.';
