-- PHASE B residual: persist cover *candidate* separately from validated cover.
-- source_cover_url remains validated-only (Admin display / no broken img).
-- source_cover_candidate_url = raw extracted URL for PHASE C rehost input.
-- Does NOT enable rehost; MEDIA_ALLOWED still required in PHASE C.

ALTER TABLE public.community_crawl_items
  ADD COLUMN IF NOT EXISTS source_cover_candidate_url text;

COMMENT ON COLUMN public.community_crawl_items.source_cover_candidate_url IS
  'Raw extracted cover candidate URL. source_cover_url is validated-only; rehost uses candidate when media_policy=MEDIA_ALLOWED.';

COMMENT ON COLUMN public.community_crawl_items.source_cover_url IS
  'Validated cover URL only (null when candidate fails fetch/content-type checks). Not hotlink SSOT for Feed.';
