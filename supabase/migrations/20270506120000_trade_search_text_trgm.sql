-- Trade search step 2 — single searchable text column + trigram index.
--
-- Search ranks only rows matching an SQL candidate filter (superset of relevance bands 0–4,
-- lib/trade/marketplace/search-candidate-sql.ts). The ranker reads title + these meta keys;
-- one stored column lets that filter be ONE `ILIKE '%word%'` per word, served by a
-- pg_trgm GIN index instead of OR-ing nine expressions.
--
-- Words never contain whitespace, so a word matches `search_text` iff it matches one of the
-- joined parts (parts are space-separated) — the filter stays exact.
--
-- Additive only: existing selects are unaffected; posts_masked gains a trailing column.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    coalesce(title, '')
    || ' ' || coalesce(meta ->> 'car_model', '')
    || ' ' || coalesce(meta ->> 'car_body_type', '')
    || ' ' || coalesce(meta ->> 'deal_type', '')
    || ' ' || coalesce(meta ->> 'estate_type', '')
    || ' ' || coalesce(meta ->> 'listing_kind', '')
    || ' ' || coalesce(meta ->> 'work_category', '')
    || ' ' || coalesce(meta ->> 'exchange_direction', '')
    || ' ' || coalesce(meta ->> 'car_trade', '')
  ) STORED;

CREATE INDEX IF NOT EXISTS posts_search_text_trgm_idx
  ON public.posts USING gin (search_text extensions.gin_trgm_ops);

-- Category list / M-HARD membership: trade_category_id IN (...) ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS posts_trade_category_created_active_idx
  ON public.posts (trade_category_id, created_at DESC)
  WHERE (status IS NULL OR status <> ALL (ARRAY['hidden'::text, 'sold'::text]));

-- Expose search_text on the read view. Rebuild from the LIVE definition (keeps the current
-- reserved_buyer_id masking) and append the column; keep security_invoker.
DO $$
DECLARE
  def text;
BEGIN
  IF to_regclass('public.posts_masked') IS NULL THEN
    RAISE NOTICE 'trade_search_text_trgm: public.posts_masked missing — skip view';
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts_masked' AND column_name = 'search_text'
  ) THEN
    RETURN;
  END IF;
  def := pg_get_viewdef('public.posts_masked'::regclass, true);
  def := regexp_replace(def, '\s+FROM\s+posts\s+p\s*;?\s*$', ', p.search_text FROM posts p', 'i');
  IF position('p.search_text' IN def) = 0 THEN
    RAISE EXCEPTION 'trade_search_text_trgm: unexpected posts_masked definition — not modified';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.posts_masked WITH (security_invoker = true) AS ' || def;
END $$;
