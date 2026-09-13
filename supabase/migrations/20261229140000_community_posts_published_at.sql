-- Community-wide publication clock (organic DB same-ts).
-- Does NOT rewrite old external import RPCs (COMPLETE REMOVE product — out of scope).

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE public.community_posts
SET published_at = created_at
WHERE published_at IS NULL;

ALTER TABLE public.community_posts
  ALTER COLUMN published_at SET NOT NULL;

-- No independent DEFAULT now() — that would be a second clock vs created_at.
-- Organic omits published_at → NULL → trigger copies created_at (same DB clock).

COMMENT ON COLUMN public.community_posts.created_at IS
  'DB row creation / audit clock. Do not backdate for Public display.';
COMMENT ON COLUMN public.community_posts.published_at IS
  'Community-wide Public publication chronology (Feed sort/display/age). Organic: equals created_at via DB trigger.';

CREATE OR REPLACE FUNCTION public.community_posts_set_published_at_from_created()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.published_at IS NULL THEN
    NEW.published_at := NEW.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_posts_published_at_default ON public.community_posts;
CREATE TRIGGER trg_community_posts_published_at_default
  BEFORE INSERT ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.community_posts_set_published_at_from_created();

CREATE INDEX IF NOT EXISTS community_posts_published_at_id_desc_idx
  ON public.community_posts (published_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS community_posts_location_published_at_id_desc_idx
  ON public.community_posts (location_id, published_at DESC, id DESC)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS community_posts_topic_published_at_id_desc_idx
  ON public.community_posts (topic_slug, published_at DESC, id DESC)
  WHERE topic_slug IS NOT NULL;
