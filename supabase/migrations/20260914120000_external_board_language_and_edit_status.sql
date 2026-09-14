-- External-board CUT A: article language SSOT + edit_status operator lifecycle.
-- Additive. Does not touch community core / board_import_* / crawl_*.

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS source_language text;

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS detected_language text;

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS display_language text;

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS translation_status text;

COMMENT ON COLUMN public.external_board_articles.source_language IS
  'Article source language (explicit / adapter / catalog fallback). Not catalog default alone.';
COMMENT ON COLUMN public.external_board_articles.detected_language IS
  'Only when a real detector exists — never fabricate.';
COMMENT ON COLUMN public.external_board_articles.display_language IS
  'Admin/DIBAY display language policy.';
COMMENT ON COLUMN public.external_board_articles.translation_status IS
  'unsupported | none | draft_ko. CUT A writers may only set unsupported|none.';

-- Relax prior edit_status check to operator lifecycle: collected|transformed|saved|published
-- Keep legacy 'editing' / 'failed' readable; app maps editing→transformed.
ALTER TABLE public.external_board_articles
  DROP CONSTRAINT IF EXISTS external_board_articles_edit_status_check;

ALTER TABLE public.external_board_articles
  ADD CONSTRAINT external_board_articles_edit_status_check
  CHECK (
    edit_status IS NULL
    OR edit_status IN ('collected', 'transformed', 'saved', 'published', 'editing', 'failed')
  );

COMMENT ON COLUMN public.external_board_articles.edit_status IS
  'Operator editing lifecycle: collected | transformed | saved | published. Distinct from ops_status.';
