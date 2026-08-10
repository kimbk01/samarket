-- Community post summary SSOT:
-- - image markdown / storage URLs never become list summary text
-- - every content insert/update derives summary in DB
-- - repair existing summaries truncated inside a pasted image URL

BEGIN;

CREATE OR REPLACE FUNCTION public.community_post_summary_from_content(
  p_content text,
  p_max integer DEFAULT 160
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_text text;
  v_max integer := greatest(1, coalesce(p_max, 160));
BEGIN
  v_text := coalesce(p_content, '');
  v_text := regexp_replace(v_text, '!\[[^]]*\]\([^)]*\)', ' ', 'g');
  v_text := regexp_replace(v_text, '!\[[^]]*\]\([^)]*$', ' ', 'g');
  v_text := regexp_replace(
    v_text,
    'https?://[^[:space:]<>"'']+/storage/v1/object/public/post-images/[^[:space:]<>"'']+',
    ' ',
    'gi'
  );
  v_text := regexp_replace(
    v_text,
    'https?://[^[:space:]<>"'']+\.(jpe?g|png|webp|gif|avif)(\?[^[:space:]<>"'']*)?',
    ' ',
    'gi'
  );
  v_text := btrim(regexp_replace(v_text, '[[:space:]]+', ' ', 'g'));

  IF char_length(v_text) <= v_max THEN
    RETURN v_text;
  END IF;
  RETURN left(v_text, v_max) || '…';
END;
$$;

CREATE OR REPLACE FUNCTION public.community_posts_set_summary_from_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.summary := public.community_post_summary_from_content(NEW.content, 160);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_summary_from_content
  ON public.community_posts;
CREATE TRIGGER community_posts_summary_from_content
BEFORE INSERT OR UPDATE OF content ON public.community_posts
FOR EACH ROW
EXECUTE FUNCTION public.community_posts_set_summary_from_content();

-- Existing polluted rows only. Preserve intentional meeting/admin summaries.
UPDATE public.community_posts
SET summary = public.community_post_summary_from_content(content, 160)
WHERE
  coalesce(summary, '') ~ '!\[[^]]*\]\('
  OR coalesce(summary, '') ~* '/storage/v1/object/public/post-images/'
  OR (
    btrim(coalesce(summary, '')) = ''
    AND btrim(public.community_post_summary_from_content(content, 160)) <> ''
  );

REVOKE ALL ON FUNCTION public.community_post_summary_from_content(text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_posts_set_summary_from_content()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.community_post_summary_from_content(text, integer)
IS 'Community list summary SSOT: removes pasted image references before truncation.';

COMMIT;
