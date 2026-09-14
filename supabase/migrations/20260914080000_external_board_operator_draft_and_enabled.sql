-- External-board operator product: source enabled + article draft (raw snapshot preserved).
-- Additive only. Does not touch board_import_* / community_crawl_* / community core writers.

ALTER TABLE public.external_board_sources
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.external_board_sources.enabled IS
  'Operator 사용/중지. false = collect/publish blocked for this source.';

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS draft_title text;

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS draft_document jsonb;

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS edit_status text
  CHECK (
    edit_status IS NULL
    OR edit_status IN ('collected', 'editing', 'saved', 'published', 'failed')
  );

COMMENT ON COLUMN public.external_board_articles.draft_title IS
  'DIBAY editable title. Raw source remains source_title / source_document.';
COMMENT ON COLUMN public.external_board_articles.draft_document IS
  'DIBAY editable document after transform/apply. Raw source_document is never overwritten by transform.';
COMMENT ON COLUMN public.external_board_articles.edit_status IS
  'Operator-facing status: collected | editing | saved | published | failed.';
