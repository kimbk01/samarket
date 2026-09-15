-- Community post views: durable unique viewer authority.
-- Authenticated: one (post_id, viewer_user_id) forever.
-- Anonymous cookie key: one (post_id, viewer_key) forever (bounded cookie identity, not person fingerprint).
-- Historical public view_count aggregates are NOT rewritten.
-- Duplicate historical event rows collapsed to earliest viewed_at per identity before unique indexes.

-- 1) Collapse duplicate authenticated viewer rows (keep earliest)
DELETE FROM public.community_post_views v
USING (
  SELECT id,
    row_number() OVER (
      PARTITION BY post_id, viewer_user_id
      ORDER BY viewed_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.community_post_views
  WHERE viewer_user_id IS NOT NULL
) d
WHERE v.id = d.id AND d.rn > 1;

-- 2) Collapse duplicate anonymous viewer_key rows (keep earliest)
DELETE FROM public.community_post_views v
USING (
  SELECT id,
    row_number() OVER (
      PARTITION BY post_id, viewer_key
      ORDER BY viewed_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.community_post_views
  WHERE viewer_user_id IS NULL
    AND viewer_key IS NOT NULL
    AND length(trim(viewer_key)) > 0
) d
WHERE v.id = d.id AND d.rn > 1;

-- 3) Durable unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS community_post_views_post_user_unique
  ON public.community_post_views (post_id, viewer_user_id)
  WHERE viewer_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS community_post_views_post_key_unique
  ON public.community_post_views (post_id, viewer_key)
  WHERE viewer_user_id IS NULL
    AND viewer_key IS NOT NULL
    AND length(trim(viewer_key)) > 0;

-- 4) Canonical RPC — forever unique; increment only when insert succeeds
CREATE OR REPLACE FUNCTION public.record_community_post_view(
  p_post_id uuid,
  p_viewer_user_id uuid DEFAULT NULL,
  p_viewer_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id uuid;
  v_view_count integer;
  v_key text := nullif(trim(p_viewer_key), '');
  v_lock_key bigint;
  v_inserted_id uuid;
BEGIN
  v_lock_key := hashtext(
    p_post_id::text || ':' || coalesce(p_viewer_user_id::text, coalesce(v_key, 'anon'))
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT user_id, COALESCE(view_count, 0)
  INTO v_author_id, v_view_count
  FROM public.community_posts
  WHERE id = p_post_id
    AND COALESCE(status, 'active') = 'active'
    AND COALESCE(is_hidden, false) = false
    AND COALESCE(is_deleted, false) = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'view_count', -1, 'deduped', false, 'counted', false);
  END IF;

  IF p_viewer_user_id IS NOT NULL AND v_author_id IS NOT NULL AND p_viewer_user_id = v_author_id THEN
    RETURN jsonb_build_object(
      'ok', true,
      'view_count', v_view_count,
      'deduped', true,
      'counted', false,
      'reason', 'author_self'
    );
  END IF;

  IF p_viewer_user_id IS NULL AND v_key IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'view_count', v_view_count,
      'deduped', true,
      'counted', false,
      'reason', 'missing_viewer'
    );
  END IF;

  IF p_viewer_user_id IS NOT NULL THEN
    INSERT INTO public.community_post_views (post_id, viewer_user_id, viewer_key)
    VALUES (p_post_id, p_viewer_user_id, NULL)
    ON CONFLICT (post_id, viewer_user_id) WHERE (viewer_user_id IS NOT NULL)
    DO NOTHING
    RETURNING id INTO v_inserted_id;
  ELSE
    INSERT INTO public.community_post_views (post_id, viewer_user_id, viewer_key)
    VALUES (p_post_id, NULL, v_key)
    ON CONFLICT (post_id, viewer_key)
      WHERE (viewer_user_id IS NULL AND viewer_key IS NOT NULL AND length(trim(viewer_key)) > 0)
    DO NOTHING
    RETURNING id INTO v_inserted_id;
  END IF;

  IF v_inserted_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'view_count', v_view_count, 'deduped', true, 'counted', false);
  END IF;

  UPDATE public.community_posts
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_post_id
  RETURNING view_count INTO v_view_count;

  RETURN jsonb_build_object('ok', true, 'view_count', v_view_count, 'deduped', false, 'counted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_community_post_view(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_community_post_view(uuid, uuid, text) TO service_role;
