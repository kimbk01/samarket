-- DIBAY Community Board Import Reconstruction SSOT
-- Author Pools, Attribution Requirement & Visibility, Persona Materialization & View Seed

-- 1. Author Pools & Aliases
CREATE TABLE IF NOT EXISTS public.community_author_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_author_pools ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'community_author_pools' AND policyname = 'community_author_pools_admin_read'
  ) THEN
    CREATE POLICY "community_author_pools_admin_read" ON public.community_author_pools
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'community_author_pools' AND policyname = 'community_author_pools_service_role'
  ) THEN
    CREATE POLICY "community_author_pools_service_role" ON public.community_author_pools
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.community_author_pool_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.community_author_pools(id) ON DELETE CASCADE,
  alias_name text NOT NULL,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pool_alias UNIQUE (pool_id, alias_name)
);

ALTER TABLE public.community_author_pool_aliases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'community_author_pool_aliases' AND policyname = 'community_author_pool_aliases_admin_read'
  ) THEN
    CREATE POLICY "community_author_pool_aliases_admin_read" ON public.community_author_pool_aliases
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'community_author_pool_aliases' AND policyname = 'community_author_pool_aliases_service_role'
  ) THEN
    CREATE POLICY "community_author_pool_aliases_service_role" ON public.community_author_pool_aliases
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Sources: attribution_requirement
ALTER TABLE public.community_crawl_sources
  ADD COLUMN IF NOT EXISTS attribution_requirement text NOT NULL DEFAULT 'DISCRETIONARY';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_crawl_sources_attribution_req_check'
      AND conrelid = 'public.community_crawl_sources'::regclass
  ) THEN
    ALTER TABLE public.community_crawl_sources
      ADD CONSTRAINT community_crawl_sources_attribution_req_check
      CHECK (attribution_requirement IN ('MANDATORY', 'DISCRETIONARY'));
  END IF;
END $$;

-- 3. Boards: author_pool_id, public_attribution_mode, media_required, date_recent_*
ALTER TABLE public.community_crawl_boards
  ADD COLUMN IF NOT EXISTS author_pool_id uuid REFERENCES public.community_author_pools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS public_attribution_mode text NOT NULL DEFAULT 'VISIBLE',
  ADD COLUMN IF NOT EXISTS media_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS date_recent_min_days integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS date_recent_max_days integer DEFAULT 7;

ALTER TABLE public.community_crawl_boards
  DROP CONSTRAINT IF EXISTS community_crawl_boards_date_policy_check;

ALTER TABLE public.community_crawl_boards
  ADD CONSTRAINT community_crawl_boards_date_policy_check
  CHECK (date_policy IN ('SOURCE_DATE', 'IMPORT_DATE', 'RANDOM_RANGE', 'RECENT_RANDOM'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_crawl_boards_public_attribution_mode_check'
      AND conrelid = 'public.community_crawl_boards'::regclass
  ) THEN
    ALTER TABLE public.community_crawl_boards
      ADD CONSTRAINT community_crawl_boards_public_attribution_mode_check
      CHECK (public_attribution_mode IN ('VISIBLE', 'HIDDEN'));
  END IF;
END $$;

-- 4. Items: persona_materialized_at
ALTER TABLE public.community_crawl_items
  ADD COLUMN IF NOT EXISTS persona_materialized_at timestamptz DEFAULT NULL;

-- 5. Post Links: initial_view_seed, public_attribution_mode
ALTER TABLE public.community_crawl_post_links
  ADD COLUMN IF NOT EXISTS initial_view_seed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_attribution_mode text NOT NULL DEFAULT 'VISIBLE';

-- 6. Canonical Publish Full Content RPC update
CREATE OR REPLACE FUNCTION public.community_crawl_publish_full_content(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_board_id uuid;
  v_principal uuid;
  v_section_id uuid;
  v_topic_id uuid;
  v_source_post_id text;
  v_canonical_url text;
  v_section_slug text;
  v_topic_slug text;
  v_title text;
  v_content text;
  v_summary text;
  v_region_label text;
  v_category text;
  v_display_author_name text;
  v_display_author_avatar_url text;
  v_source_published_at timestamptz;
  v_created_at timestamptz;
  v_view_count integer;
  v_initial_view_seed integer;
  v_public_attribution_mode text;
  v_images jsonb;
  v_images_jsonb jsonb := '[]'::jsonb;
  v_board record;
  v_topic record;
  v_existing_id uuid;
  v_existing_link_id uuid;
  v_post_id uuid;
  v_link_id uuid;
  v_now timestamptz := clock_timestamp();
  v_img jsonb;
  v_image_url text;
  v_storage_path text;
  v_sort integer;
  v_idx integer := 0;
  v_media_delta integer := 0;
  v_updated boolean := false;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload', 'http_status', 400);
  END IF;

  BEGIN
    v_board_id := nullif(btrim(coalesce(p_payload->>'board_id', '')), '')::uuid;
    v_principal := nullif(btrim(coalesce(p_payload->>'principal_user_id', '')), '')::uuid;
    v_section_id := nullif(btrim(coalesce(p_payload->>'section_id', '')), '')::uuid;
    v_topic_id := nullif(btrim(coalesce(p_payload->>'topic_id', '')), '')::uuid;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ids_invalid', 'http_status', 400);
  END;

  v_source_post_id := nullif(btrim(coalesce(p_payload->>'source_post_id', '')), '');
  v_canonical_url := nullif(btrim(coalesce(p_payload->>'canonical_url', '')), '');
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
  v_public_attribution_mode := coalesce(nullif(btrim(coalesce(p_payload->>'public_attribution_mode', '')), ''), 'VISIBLE');

  IF p_payload ? 'images' AND jsonb_typeof(p_payload->'images') = 'array' THEN
    v_images := p_payload->'images';
  ELSE
    v_images := '[]'::jsonb;
  END IF;

  IF p_payload ? 'source_published_at' AND nullif(btrim(coalesce(p_payload->>'source_published_at', '')), '') IS NOT NULL THEN
    BEGIN
      v_source_published_at := (p_payload->>'source_published_at')::timestamptz;
    EXCEPTION WHEN others THEN
      v_source_published_at := NULL;
    END;
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

  IF v_board_id IS NULL OR v_principal IS NULL OR v_section_id IS NULL OR v_topic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_ids', 'http_status', 400);
  END IF;
  IF v_canonical_url IS NULL AND v_source_post_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_identity_required', 'http_status', 400);
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

  SELECT b.*, s.id AS src_id, s.name AS src_name, s.policy_status, s.publish_mode, s.status AS src_status
    INTO v_board
  FROM public.community_crawl_boards b
  JOIN public.community_crawl_sources s ON s.id = b.source_id
  WHERE b.id = v_board_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'board_not_found', 'http_status', 404);
  END IF;

  IF v_board.src_status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_not_active', 'http_status', 400);
  END IF;
  IF v_board.policy_status = 'DISABLED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_policy_disabled', 'http_status', 400);
  END IF;
  IF v_board.dibay_topic_id IS DISTINCT FROM v_topic_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'topic_mismatch', 'http_status', 400);
  END IF;

  SELECT t.id, t.slug INTO v_topic
  FROM public.community_topics t
  WHERE t.id = v_topic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'topic_not_found', 'http_status', 400);
  END IF;

  -- Validate image payloads before any write
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

  SELECT l.id, l.community_post_id INTO v_existing_link_id, v_existing_id
  FROM public.community_crawl_post_links l
  WHERE l.board_id = v_board_id
    AND (
      (v_source_post_id IS NOT NULL AND l.source_post_id = v_source_post_id)
      OR (v_canonical_url IS NOT NULL AND l.canonical_url = v_canonical_url)
    )
  ORDER BY l.created_at ASC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    v_updated := true;
    v_post_id := v_existing_id;
    v_link_id := v_existing_link_id;

    UPDATE public.community_posts
    SET
      title = v_title,
      content = v_content,
      summary = coalesce(v_summary, left(v_content, 160)),
      region_label = v_region_label,
      category = v_category,
      images = v_images_jsonb,
      display_author_name = v_display_author_name,
      display_author_avatar_url = v_display_author_avatar_url,
      view_count = v_view_count,
      updated_at = v_now
    WHERE id = v_post_id;

    UPDATE public.community_crawl_post_links
    SET
      source_post_id = coalesce(v_source_post_id, source_post_id),
      canonical_url = coalesce(v_canonical_url, canonical_url),
      source_published_at = coalesce(v_source_published_at, source_published_at),
      last_seen_at = v_now,
      last_synced_at = v_now,
      updated_at = v_now,
      initial_view_seed = v_initial_view_seed,
      public_attribution_mode = v_public_attribution_mode
    WHERE id = v_link_id;
  ELSE
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
      created_at,
      view_count
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
      v_created_at,
      v_view_count
    )
    RETURNING id INTO v_post_id;

    INSERT INTO public.community_crawl_post_links (
      board_id,
      source_post_id,
      canonical_url,
      community_post_id,
      source_published_at,
      manual_override,
      source_status,
      last_seen_at,
      last_synced_at,
      initial_view_seed,
      public_attribution_mode
    ) VALUES (
      v_board_id,
      v_source_post_id,
      v_canonical_url,
      v_post_id,
      v_source_published_at,
      true,
      'ACTIVE',
      v_now,
      v_now,
      v_initial_view_seed,
      v_public_attribution_mode
    )
    RETURNING id INTO v_link_id;
  END IF;

  -- Exact replace-set for community_post_images (same transaction)
  DELETE FROM public.community_post_images WHERE post_id = v_post_id;

  v_idx := 0;
  FOR v_img IN SELECT * FROM jsonb_array_elements(v_images)
  LOOP
    v_image_url := nullif(btrim(coalesce(v_img->>'image_url', '')), '');
    v_storage_path := coalesce(btrim(coalesce(v_img->>'storage_path', '')), '');
    IF v_img ? 'sort_order' AND (v_img->>'sort_order') ~ '^-?[0-9]+$' THEN
      v_sort := (v_img->>'sort_order')::integer;
    ELSE
      v_sort := v_idx;
    END IF;
    INSERT INTO public.community_post_images (post_id, image_url, storage_path, sort_order)
    VALUES (v_post_id, v_image_url, v_storage_path, v_sort);
    v_media_delta := v_media_delta + 1;
    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'community_post_id', v_post_id,
    'post_link_id', v_link_id,
    'origin_kind', 'imported',
    'publish_mode', 'FULL_CONTENT',
    'point_reward', 0,
    'media_delta', v_media_delta,
    'updated', v_updated
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_imported', 'http_status', 409);
  WHEN others THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'full_content_publish_failed',
      'detail', SQLERRM,
      'http_status', 500
    );
END;
$$;

REVOKE ALL ON FUNCTION public.community_crawl_publish_full_content(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_crawl_publish_full_content(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.community_crawl_publish_full_content(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.community_crawl_publish_full_content(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.community_crawl_publish_full_content(jsonb) TO service_role;
