-- board_import: materialization columns + atomic publish RPC
-- Reuses Community post shape from community_crawl_publish_full_content (same columns)
-- but links board_import_articles (clean-room), not crawl post_links.

ALTER TABLE public.board_import_articles
  ADD COLUMN IF NOT EXISTS display_author_name text NULL,
  ADD COLUMN IF NOT EXISTS display_author_avatar_url text NULL,
  ADD COLUMN IF NOT EXISTS display_date timestamptz NULL,
  ADD COLUMN IF NOT EXISTS initial_view_seed integer NULL,
  ADD COLUMN IF NOT EXISTS persona_materialized_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dibay_title text NULL,
  ADD COLUMN IF NOT EXISTS dibay_content text NULL;

CREATE OR REPLACE FUNCTION public.board_import_publish_article(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article_id uuid;
  v_principal uuid;
  v_section_id uuid;
  v_topic_id uuid;
  v_section_slug text;
  v_topic_slug text;
  v_title text;
  v_content text;
  v_summary text;
  v_region_label text;
  v_category text;
  v_display_author_name text;
  v_display_author_avatar_url text;
  v_created_at timestamptz;
  v_view_count integer;
  v_initial_view_seed integer;
  v_images jsonb;
  v_images_jsonb jsonb := '[]'::jsonb;
  v_article record;
  v_img jsonb;
  v_image_url text;
  v_storage_path text;
  v_sort integer;
  v_idx integer := 0;
  v_media_delta integer := 0;
  v_post_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload', 'http_status', 400);
  END IF;

  BEGIN
    v_article_id := nullif(btrim(coalesce(p_payload->>'article_id', '')), '')::uuid;
    v_principal := nullif(btrim(coalesce(p_payload->>'principal_user_id', '')), '')::uuid;
    v_section_id := nullif(btrim(coalesce(p_payload->>'section_id', '')), '')::uuid;
    v_topic_id := nullif(btrim(coalesce(p_payload->>'topic_id', '')), '')::uuid;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ids_invalid', 'http_status', 400);
  END;

  v_section_slug := nullif(btrim(coalesce(p_payload->>'section_slug', '')), '');
  v_topic_slug := nullif(btrim(coalesce(p_payload->>'topic_slug', '')), '');
  v_title := nullif(btrim(coalesce(p_payload->>'title', '')), '');
  v_content := nullif(btrim(coalesce(p_payload->>'content', '')), '');
  v_summary := nullif(btrim(coalesce(p_payload->>'summary', '')), '');
  v_region_label := coalesce(nullif(btrim(coalesce(p_payload->>'region_label', '')), ''), '필리핀');
  v_category := coalesce(nullif(btrim(coalesce(p_payload->>'category', '')), ''), 'etc');
  v_display_author_name := nullif(btrim(coalesce(p_payload->>'display_author_name', '')), '');
  v_display_author_avatar_url := nullif(btrim(coalesce(p_payload->>'display_author_avatar_url', '')), '');
  v_view_count := greatest(0, coalesce((p_payload->>'view_count')::integer, 0));
  v_initial_view_seed := greatest(0, coalesce((p_payload->>'initial_view_seed')::integer, v_view_count));

  IF p_payload ? 'images' AND jsonb_typeof(p_payload->'images') = 'array' THEN
    v_images := p_payload->'images';
  ELSE
    v_images := '[]'::jsonb;
  END IF;

  IF p_payload ? 'created_at' AND nullif(btrim(coalesce(p_payload->>'created_at', '')), '') IS NOT NULL THEN
    BEGIN
      v_created_at := (p_payload->>'created_at')::timestamptz;
    EXCEPTION WHEN others THEN
      v_created_at := v_now;
    END;
  ELSE
    v_created_at := v_now;
  END IF;

  IF v_article_id IS NULL OR v_principal IS NULL OR v_section_id IS NULL OR v_topic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_ids', 'http_status', 400);
  END IF;
  IF v_title IS NULL OR v_content IS NULL OR v_section_slug IS NULL OR v_topic_slug IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'title_content_topic_required', 'http_status', 400);
  END IF;
  IF char_length(v_title) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'title_too_short', 'http_status', 400);
  END IF;
  IF char_length(v_content) < 20 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_body_too_short', 'http_status', 400);
  END IF;
  IF v_display_author_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'display_author_required', 'http_status', 400);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_import_principal p WHERE p.user_id = v_principal
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'import_principal_mismatch', 'http_status', 400);
  END IF;

  SELECT * INTO v_article
  FROM public.board_import_articles
  WHERE id = v_article_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'article_not_found', 'http_status', 404);
  END IF;

  IF v_article.published_post_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'community_post_id', v_article.published_post_id,
      'already_published', true,
      'updated', false
    );
  END IF;

  IF v_article.failure_code IS NOT NULL AND v_article.published_post_id IS NULL THEN
    -- allow retry of failed articles: clear failure on successful path after insert
    NULL;
  END IF;

  FOR v_img IN SELECT * FROM jsonb_array_elements(v_images)
  LOOP
    v_image_url := nullif(btrim(coalesce(v_img->>'image_url', '')), '');
    v_storage_path := coalesce(btrim(coalesce(v_img->>'storage_path', '')), '');
    IF v_image_url IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'image_url_required', 'http_status', 400);
    END IF;
    IF v_image_url !~* '^https?://' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'image_url_invalid', 'http_status', 400);
    END IF;
    v_images_jsonb := v_images_jsonb || jsonb_build_array(v_image_url);
  END LOOP;

  INSERT INTO public.community_posts (
    user_id,
    section_id,
    section_slug,
    topic_id,
    topic_slug,
    title,
    content,
    summary,
    region_label,
    category,
    images,
    is_question,
    is_meetup,
    meetup_place,
    meetup_date,
    status,
    is_sample_data,
    is_hidden,
    origin_kind,
    display_author_name,
    display_author_avatar_url,
    view_count,
    created_at,
    updated_at
  ) VALUES (
    v_principal,
    v_section_id,
    v_section_slug,
    v_topic_id,
    v_topic_slug,
    v_title,
    v_content,
    coalesce(v_summary, left(v_content, 160)),
    v_region_label,
    v_category,
    v_images_jsonb,
    false,
    false,
    NULL,
    NULL,
    'active',
    false,
    false,
    'imported',
    v_display_author_name,
    v_display_author_avatar_url,
    v_view_count,
    v_created_at,
    v_now
  )
  RETURNING id INTO v_post_id;

  v_idx := 0;
  FOR v_img IN SELECT * FROM jsonb_array_elements(v_images)
  LOOP
    v_image_url := nullif(btrim(coalesce(v_img->>'image_url', '')), '');
    v_storage_path := coalesce(btrim(coalesce(v_img->>'storage_path', '')), '');
    BEGIN
      v_sort := coalesce((v_img->>'sort_order')::integer, v_idx);
    EXCEPTION WHEN others THEN
      v_sort := v_idx;
    END;
    INSERT INTO public.community_post_images (post_id, image_url, storage_path, sort_order)
    VALUES (v_post_id, v_image_url, v_storage_path, v_sort);
    v_media_delta := v_media_delta + 1;
    v_idx := v_idx + 1;
  END LOOP;

  UPDATE public.board_import_articles
  SET
    published_post_id = v_post_id,
    display_author_name = v_display_author_name,
    display_author_avatar_url = v_display_author_avatar_url,
    display_date = v_created_at,
    initial_view_seed = v_initial_view_seed,
    persona_materialized_at = coalesce(persona_materialized_at, v_now),
    dibay_title = v_title,
    dibay_content = v_content,
    failure_stage = NULL,
    failure_code = NULL,
    failure_message = NULL,
    failed_at = NULL,
    updated_at = v_now
  WHERE id = v_article_id
    AND published_post_id IS NULL;

  IF NOT FOUND THEN
    -- Race: another writer won; roll back orphan post
    DELETE FROM public.community_post_images WHERE post_id = v_post_id;
    DELETE FROM public.community_posts WHERE id = v_post_id;
    SELECT published_post_id INTO v_post_id FROM public.board_import_articles WHERE id = v_article_id;
    RETURN jsonb_build_object(
      'ok', true,
      'community_post_id', v_post_id,
      'already_published', true,
      'updated', false,
      'race_recovered', true
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'community_post_id', v_post_id,
    'already_published', false,
    'updated', false,
    'media_delta', v_media_delta,
    'origin_kind', 'imported'
  );
EXCEPTION WHEN unique_violation THEN
  SELECT published_post_id INTO v_post_id
  FROM public.board_import_articles
  WHERE id = v_article_id;
  IF v_post_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'community_post_id', v_post_id,
      'already_published', true,
      'updated', false
    );
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'unique_violation', 'http_status', 409);
END;
$$;

REVOKE ALL ON FUNCTION public.board_import_publish_article(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.board_import_publish_article(jsonb) TO service_role;

COMMENT ON FUNCTION public.board_import_publish_article(jsonb) IS
  'Clean-room board import: atomic community_posts + images + board_import_articles.published_post_id';
