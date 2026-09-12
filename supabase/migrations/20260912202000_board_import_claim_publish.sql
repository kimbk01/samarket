-- P0 concurrency: serialize pre-RPC media rehost so race loser resolves idempotent
-- (not media_upload_failed) while winner still holds the publish path.

ALTER TABLE public.board_import_articles
  ADD COLUMN IF NOT EXISTS publish_inflight_at timestamptz NULL;

COMMENT ON COLUMN public.board_import_articles.publish_inflight_at IS
  'Soft claim before media rehost; cleared on publish success or real failure. Stale after 5 minutes.';

CREATE OR REPLACE FUNCTION public.board_import_claim_publish(p_article_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article public.board_import_articles%ROWTYPE;
  v_stale interval := interval '5 minutes';
BEGIN
  IF p_article_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_ids', 'http_status', 400);
  END IF;

  SELECT * INTO v_article
  FROM public.board_import_articles
  WHERE id = p_article_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'article_not_found', 'http_status', 404);
  END IF;

  IF v_article.published_post_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'already_published',
      'community_post_id', v_article.published_post_id,
      'display_author_name', coalesce(v_article.display_author_name, ''),
      'display_date', v_article.display_date,
      'initial_view_seed', v_article.initial_view_seed,
      'dibay_title', coalesce(v_article.dibay_title, v_article.source_title, '')
    );
  END IF;

  IF v_article.publish_inflight_at IS NOT NULL
     AND v_article.publish_inflight_at > now() - v_stale THEN
    RETURN jsonb_build_object('ok', true, 'status', 'peer_inflight');
  END IF;

  UPDATE public.board_import_articles
  SET
    publish_inflight_at = now(),
    updated_at = now()
  WHERE id = p_article_id
    AND published_post_id IS NULL;

  RETURN jsonb_build_object('ok', true, 'status', 'claimed');
END;
$$;

REVOKE ALL ON FUNCTION public.board_import_claim_publish(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.board_import_claim_publish(uuid) TO service_role;

COMMENT ON FUNCTION public.board_import_claim_publish(uuid) IS
  'Clean-room board import: FOR UPDATE soft-claim before media so concurrent publish loser waits for idempotent existing publication';
