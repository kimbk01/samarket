-- SB1 patch: legacy business_type 후보를 선택 2차 sub(slug/name)까지 좁힘 — RPC payload·product/banner join 비용 절감.
-- TS `browseStoreRowMatchesSubFilter` 와 동일 의도 (배포 DB용 CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_stores_browse_snapshot(
  p_region text DEFAULT '',
  p_category text DEFAULT '',
  p_sort text DEFAULT '',
  p_limit integer DEFAULT 120,
  p_cursor text DEFAULT '',
  p_search text DEFAULT '',
  p_sub text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary text := lower(trim(coalesce(p_category, '')));
  v_sub text := lower(trim(coalesce(p_sub, '')));
  v_wants_all boolean := v_sub = '' OR v_sub = 'all';
  v_fetch_cap integer := greatest(1, least(120, coalesce(p_limit, 120)));
  v_category_id uuid;
  v_category_name text;
  v_category_slug text;
  v_unknown_primary boolean := false;
  v_unknown_topic boolean := false;
  v_resolved_topic_id uuid;
  v_selected_topic_slug text;
  v_selected_topic_name text;
  v_topic_list jsonb := '[]'::jsonb;
BEGIN
  IF v_primary = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'primary_required', 'updated_at', now());
  END IF;

  SELECT c.id, c.slug, c.name
  INTO v_category_id, v_category_slug, v_category_name
  FROM public.store_categories c
  WHERE c.slug = v_primary AND c.is_active = true
  LIMIT 1;

  IF v_category_id IS NULL THEN
    v_unknown_primary := true;
    RETURN jsonb_build_object(
      'ok', true,
      'unknown_primary', true,
      'unknown_topic', false,
      'taxonomy', jsonb_build_object(
        'categoryId', '',
        'categorySlug', v_primary,
        'categoryName', v_primary,
        'primaryAliases', jsonb_build_array(v_primary),
        'topicList', '[]'::jsonb,
        'resolvedTopicId', null,
        'selectedTopicMeta', null,
        'unknownPrimary', true,
        'unknownTopic', false
      ),
      'store_rows', '[]'::jsonb,
      'products', '[]'::jsonb,
      'banners', '[]'::jsonb,
      'snapshot_version', floor(extract(epoch from now()) * 1000)::bigint,
      'updated_at', now()
    );
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name)
      ORDER BY coalesce(t.sort_order, 0), t.slug
    ),
    '[]'::jsonb
  )
  INTO v_topic_list
  FROM public.store_topics t
  WHERE t.store_category_id = v_category_id
    AND coalesce(t.is_active, true) = true;

  IF NOT v_wants_all THEN
    SELECT t.id, t.slug, t.name
    INTO v_resolved_topic_id, v_selected_topic_slug, v_selected_topic_name
    FROM public.store_topics t
    WHERE t.store_category_id = v_category_id
      AND lower(trim(t.slug)) = v_sub
      AND coalesce(t.is_active, true) = true
    LIMIT 1;
    IF v_resolved_topic_id IS NULL THEN
      v_unknown_topic := true;
      RETURN jsonb_build_object(
        'ok', true,
        'unknown_primary', false,
        'unknown_topic', true,
        'taxonomy', jsonb_build_object(
          'categoryId', v_category_id,
          'categorySlug', v_category_slug,
          'categoryName', coalesce(v_category_name, v_primary),
          'primaryAliases', jsonb_build_array(v_primary, coalesce(v_category_name, v_primary)),
          'topicList', coalesce(v_topic_list, '[]'::jsonb),
          'resolvedTopicId', null,
          'selectedTopicMeta', null,
          'unknownPrimary', false,
          'unknownTopic', true
        ),
        'store_rows', '[]'::jsonb,
        'products', '[]'::jsonb,
        'banners', '[]'::jsonb,
        'snapshot_version', floor(extract(epoch from now()) * 1000)::bigint,
        'updated_at', now()
      );
    END IF;
  END IF;

  RETURN (
    WITH store_candidates AS (
      SELECT
        s.*,
        CASE
          WHEN st.id IS NOT NULL THEN jsonb_build_object('slug', st.slug, 'name', st.name)
          ELSE null
        END AS store_topics
      FROM public.stores s
      LEFT JOIN public.store_topics st ON st.id = s.store_topic_id
      WHERE s.approval_status = 'approved'
        AND s.is_visible = true
        AND (
          (
            s.store_category_id = v_category_id
            AND (v_wants_all OR s.store_topic_id = v_resolved_topic_id)
          )
          OR (
            s.store_category_id = v_category_id
            AND NOT v_wants_all
            AND v_resolved_topic_id IS NOT NULL
            AND s.store_topic_id IS NULL
            AND (
              s.business_type ILIKE '%' || v_primary || ' ·%'
              OR s.business_type ILIKE '%' || v_primary || '·%'
              OR s.business_type ILIKE '%' || v_primary || ' -%'
              OR s.business_type ILIKE '%' || v_primary || '-%'
              OR s.business_type ILIKE '%' || coalesce(v_category_name, '') || ' ·%'
              OR s.business_type ILIKE '%' || coalesce(v_category_name, '') || '·%'
              OR s.business_type ILIKE '%' || coalesce(v_category_name, '') || ' -%'
              OR s.business_type ILIKE '%' || coalesce(v_category_name, '') || '-%'
            )
            AND (
              s.business_type ILIKE '% · ' || v_selected_topic_slug || '%'
              OR s.business_type ILIKE '%·' || v_selected_topic_slug || '%'
              OR s.business_type ILIKE '% ·' || v_selected_topic_slug || '%'
              OR s.business_type ILIKE '% - ' || v_selected_topic_slug || '%'
              OR s.business_type ILIKE '%-' || v_selected_topic_slug || '%'
              OR (
                coalesce(v_selected_topic_name, '') <> ''
                AND (
                  s.business_type ILIKE '% · ' || v_selected_topic_name || '%'
                  OR s.business_type ILIKE '%·' || v_selected_topic_name || '%'
                  OR s.business_type ILIKE '% ·' || v_selected_topic_name || '%'
                  OR s.business_type ILIKE '% - ' || v_selected_topic_name || '%'
                  OR s.business_type ILIKE '%-' || v_selected_topic_name || '%'
                )
              )
            )
          )
          OR (
            s.store_category_id IS NULL
            AND (
              s.business_type ILIKE '%' || v_primary || ' ·%'
              OR s.business_type ILIKE '%' || v_primary || '·%'
              OR s.business_type ILIKE '%' || v_primary || ' -%'
              OR s.business_type ILIKE '%' || v_primary || '-%'
              OR s.business_type ILIKE '%' || coalesce(v_category_name, '') || ' ·%'
              OR s.business_type ILIKE '%' || coalesce(v_category_name, '') || '·%'
              OR s.business_type ILIKE '%' || coalesce(v_category_name, '') || ' -%'
              OR s.business_type ILIKE '%' || coalesce(v_category_name, '') || '-%'
            )
            AND (
              v_wants_all
              OR (
                s.business_type ILIKE '% · ' || v_selected_topic_slug || '%'
                OR s.business_type ILIKE '%·' || v_selected_topic_slug || '%'
                OR s.business_type ILIKE '% ·' || v_selected_topic_slug || '%'
                OR s.business_type ILIKE '% - ' || v_selected_topic_slug || '%'
                OR s.business_type ILIKE '%-' || v_selected_topic_slug || '%'
                OR (
                  coalesce(v_selected_topic_name, '') <> ''
                  AND (
                    s.business_type ILIKE '% · ' || v_selected_topic_name || '%'
                    OR s.business_type ILIKE '%·' || v_selected_topic_name || '%'
                    OR s.business_type ILIKE '% ·' || v_selected_topic_name || '%'
                    OR s.business_type ILIKE '% - ' || v_selected_topic_name || '%'
                    OR s.business_type ILIKE '%-' || v_selected_topic_name || '%'
                  )
                )
              )
            )
          )
        )
      ORDER BY s.created_at DESC NULLS LAST, s.id
      LIMIT v_fetch_cap
    ),
    store_ids AS (
      SELECT id FROM store_candidates
    ),
    product_rows AS (
      SELECT p.id, p.store_id, p.title, p.price, p.thumbnail_url, p.is_featured, p.sort_order
      FROM public.store_products p
      WHERE p.store_id IN (SELECT id FROM store_ids)
        AND p.product_status = 'active'
      ORDER BY p.is_featured DESC NULLS LAST, p.sort_order ASC NULLS LAST, p.id
      LIMIT least(v_fetch_cap * 6, 360)
    ),
    banner_rows AS (
      SELECT b.store_id, b.id, b.image_url, b.sort_order, b.is_active, b.start_at, b.end_at
      FROM public.store_banners b
      WHERE b.store_id IN (SELECT id FROM store_ids)
      ORDER BY b.sort_order ASC NULLS LAST, b.id ASC
    )
    SELECT jsonb_build_object(
      'ok', true,
      'unknown_primary', false,
      'unknown_topic', false,
      'taxonomy', jsonb_build_object(
        'categoryId', v_category_id,
        'categorySlug', v_category_slug,
        'categoryName', coalesce(v_category_name, v_primary),
        'primaryAliases', jsonb_build_array(v_primary, coalesce(v_category_name, v_primary)),
        'topicList', coalesce(v_topic_list, '[]'::jsonb),
        'resolvedTopicId', v_resolved_topic_id,
        'selectedTopicMeta',
          CASE
            WHEN v_wants_all OR v_selected_topic_slug IS NULL THEN null
            ELSE jsonb_build_object('slug', v_selected_topic_slug, 'name', v_selected_topic_name)
          END,
        'unknownPrimary', false,
        'unknownTopic', false
      ),
      'store_rows', coalesce((
        SELECT jsonb_agg(
          to_jsonb(sc) - 'store_topics'
          || jsonb_build_object('store_topics', sc.store_topics)
        )
        FROM store_candidates sc
      ), '[]'::jsonb),
      'products', coalesce((SELECT jsonb_agg(to_jsonb(pr)) FROM product_rows pr), '[]'::jsonb),
      'banners', coalesce((SELECT jsonb_agg(to_jsonb(br)) FROM banner_rows br), '[]'::jsonb),
      'snapshot_version', floor(extract(epoch from now()) * 1000)::bigint,
      'updated_at', now()
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_stores_browse_snapshot(text, text, text, integer, text, text, text) IS
  'SB1 stores browse — taxonomy + stores + product/banner previews; legacy business_type rows scoped to selected sub.';
