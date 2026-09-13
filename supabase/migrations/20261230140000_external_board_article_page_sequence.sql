-- External board article collection page/sequence metadata (Admin durable inbox).
ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS source_page int NULL,
  ADD COLUMN IF NOT EXISTS source_sequence int NULL;

COMMENT ON COLUMN public.external_board_articles.source_page IS
  '1-based source list page where article was discovered; null if unknown.';
COMMENT ON COLUMN public.external_board_articles.source_sequence IS
  '0-based order within the discovery batch (0 = newest on that collection).';
