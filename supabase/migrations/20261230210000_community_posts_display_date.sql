-- PHASE F minimum corrective: community_posts.display_date
-- Repo/feed already select this column with missing-column fallback.
-- Live Production lacked the column, so operator publish insert failed.

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS display_date timestamptz NULL;

COMMENT ON COLUMN public.community_posts.display_date IS
  'Imported SOURCE_PUBLISHED_AT snapshot for display. Null for normal member posts.';
