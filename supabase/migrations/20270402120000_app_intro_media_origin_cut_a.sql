-- DIBAY INTRO — CUT A
-- Additive media_origin classification for QA isolation.
-- Does NOT alter Intro document authority / Live / Publish / Call / Popup.
-- Replay-safe.

BEGIN;

ALTER TABLE public.app_intro_media
  ADD COLUMN IF NOT EXISTS media_origin text NOT NULL DEFAULT 'OPERATOR';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_intro_media_origin_check'
  ) THEN
    ALTER TABLE public.app_intro_media
      ADD CONSTRAINT app_intro_media_origin_check
      CHECK (media_origin IN ('OPERATOR', 'QA_EVIDENCE', 'SYSTEM'));
  END IF;
END $$;

COMMENT ON COLUMN public.app_intro_media.media_origin IS
  'CUT A library_scope: OPERATOR (default product), QA_EVIDENCE (proof media), SYSTEM (reserved).';

CREATE INDEX IF NOT EXISTS app_intro_media_origin_list_idx
  ON public.app_intro_media (media_origin, updated_at DESC)
  WHERE deleted_at IS NULL;

-- Classify existing Phase 3/4 proof / QA evidence without deleting rows.
UPDATE public.app_intro_media
SET media_origin = 'QA_EVIDENCE'
WHERE media_origin = 'OPERATOR'
  AND (
    original_name ILIKE 'phase3-%'
    OR original_name ILIKE 'phase4-%'
    OR original_name ILIKE 'cuta-%'
    OR original_name ILIKE '%fixture%'
    OR original_name ILIKE '%.bin'
    OR original_name ILIKE 'qa-%'
    OR original_name ILIKE '%-qa-%'
  );

COMMIT;
