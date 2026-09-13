-- Owner FINAL decisions: attribution policy authority + chronology UNKNOWN contract.
-- Additive only. Does not touch board_import_* / community_crawl_*.

ALTER TABLE public.external_board_sources
  ADD COLUMN IF NOT EXISTS attribution_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.external_board_sources
  ADD COLUMN IF NOT EXISTS attribution_display_name text;

ALTER TABLE public.external_board_sources
  ADD COLUMN IF NOT EXISTS board_sequence_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.external_board_sources.attribution_required IS
  'When true, Public may show normal source attribution. Authority is rights/attribution policy — NOT origin_kind.';
COMMENT ON COLUMN public.external_board_sources.board_sequence_verified IS
  'CASE B: board newest→oldest (or sequence) semantics verified by board check.';

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS chronology_case text
    CHECK (chronology_case IS NULL OR chronology_case IN ('A', 'B', 'C'));

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS operator_published_at timestamptz;

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS operator_batch_order int;

COMMENT ON COLUMN public.external_board_articles.operator_published_at IS
  'CASE C MANUAL: explicit operator publication time. Publisher must not invent chronology.';
COMMENT ON COLUMN public.external_board_articles.chronology_case IS
  'A=source date, B=verified board sequence, C=UNKNOWN.';

-- Public attribution metadata on canonical Community post (policy-driven, not origin_kind).
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS public_attribution_name text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS public_attribution_url text;

COMMENT ON COLUMN public.community_posts.public_attribution_name IS
  'Optional Public attribution label when rights policy requires. Null = no attribution UI. Not gated by origin_kind.';
COMMENT ON COLUMN public.community_posts.public_attribution_url IS
  'Optional Public original-source URL when rights policy requires attribution.';
