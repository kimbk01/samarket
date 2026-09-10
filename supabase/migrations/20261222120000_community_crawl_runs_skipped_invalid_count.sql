-- Community crawl runs: separate SOURCE_INVALID skips from real failures.
-- COVER VALIDITY remains independent; this is run-result semantics only.

ALTER TABLE public.community_crawl_runs
  ADD COLUMN IF NOT EXISTS skipped_invalid_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.community_crawl_runs.skipped_invalid_count IS
  'Source-invalid candidates (e.g. HTTP 200 soft-404 shell). Not a crawler failure.';
