-- posts(레거시 커뮤니티 글) → community_posts 미러 — post_ads FK 정합

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_community_post_for_post_ads(
  p_post_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_post record;
  v_section_id uuid;
  v_section_slug text;
  v_topic_id uuid;
  v_topic_slug text;
  v_location_id uuid;
  v_region_label text := 'Philippines';
BEGIN
  IF p_post_id IS NULL OR p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF to_regclass('public.community_posts') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id FROM public.community_posts WHERE id = p_post_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT id INTO v_id
  FROM public.community_posts
  WHERE source_legacy_post_id = p_post_id::text
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  IF to_regclass('public.posts') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, user_id, title, content, status, type
  INTO v_post
  FROM public.posts
  WHERE id = p_post_id AND user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_post.type, '') NOT IN ('community', '') THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_post.status, 'active') IN ('deleted', 'hidden') THEN
    RETURN NULL;
  END IF;

  SELECT cs.id, cs.slug
  INTO v_section_id, v_section_slug
  FROM public.community_sections cs
  WHERE cs.is_active = true
    AND cs.slug IN ('plife', 'philife', 'dongnae')
  ORDER BY CASE cs.slug WHEN 'plife' THEN 0 WHEN 'philife' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_section_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ct.id, ct.slug
  INTO v_topic_id, v_topic_slug
  FROM public.community_topics ct
  WHERE ct.section_id = v_section_id
    AND COALESCE(ct.is_visible, true) = true
  ORDER BY ct.sort_order NULLS LAST, ct.created_at
  LIMIT 1;

  IF v_topic_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF to_regclass('public.locations') IS NOT NULL THEN
    SELECT l.id, COALESCE(l.district, l.city, l.region, v_region_label)
    INTO v_location_id, v_region_label
    FROM public.locations l
    WHERE COALESCE(l.is_active, true) = true
    ORDER BY l.created_at NULLS LAST
    LIMIT 1;
  END IF;

  INSERT INTO public.community_posts (
    id,
    user_id,
    section_id,
    section_slug,
    topic_id,
    topic_slug,
    title,
    content,
    summary,
    region_label,
    location_id,
    category,
    images,
    is_question,
    is_meetup,
    status,
    source_legacy_post_id
  ) VALUES (
    p_post_id,
    v_post.user_id,
    v_section_id,
    v_section_slug,
    v_topic_id,
    v_topic_slug,
    COALESCE(NULLIF(trim(v_post.title), ''), '(제목 없음)'),
    COALESCE(v_post.content, ''),
    left(COALESCE(v_post.content, ''), 180),
    COALESCE(v_region_label, 'Philippines'),
    v_location_id,
    'etc',
    '[]'::jsonb,
    false,
    false,
    'active',
    p_post_id::text
  )
  ON CONFLICT (id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN COALESCE(v_id, p_post_id);
EXCEPTION
  WHEN undefined_column THEN
    RETURN NULL;
  WHEN undefined_table THEN
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_community_post_for_post_ads(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_community_post_for_post_ads(uuid, uuid) TO service_role;

COMMIT;
