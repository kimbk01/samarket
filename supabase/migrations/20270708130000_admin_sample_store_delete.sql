-- 묶음 3-C · 설계 §9-4 — 관리자 샘플 매장 삭제 (DB-4 · DB-5 · DB-6).
-- 운영 적용은 Owner 승인 후. 이 파일은 함수·트리거 정의만 추가한다 (데이터 변경 없음).
--
-- DB-4 admin_sample_store_delete_preview(uuid[])  — 읽기 전용 사전 확인 (매장별 jsonb)
-- DB-5 admin_delete_sample_store(uuid, uuid)       — SECURITY DEFINER, service_role 만 EXECUTE
-- DB-6 stores BEFORE DELETE 보호 트리거            — store_kind <> 'sample' 삭제는 어떤 경로든 예외
--
-- 차단 조건 (§9-4 ②):
--   · store_kind <> 'sample'
--   · stores 를 참조하는 RESTRICT / NO ACTION FK 참조 1건 이상 — FK 목록은 pg_constraint 에서 동적으로 읽는다
--     (하드코딩 없음 · 2026-10-29 운영 조회: RESTRICT 23 + NO ACTION 3). CASCADE 로 함께 지워지는 하위 테이블을
--     RESTRICT / NO ACTION 으로 참조하는 FK(예: store_order_items → store_products)도 같은 방식으로 센다.
--   · 배너 캠페인(store_banner_ad_campaigns, SET NULL)이 ENDED / ARCHIVED 가 아님 (광고 삭제 계약 유지 —
--     먼저 admin_delivery_ad_transition 으로 종료)
--   · 유료 광고 캠페인(store_paid_ad_campaigns)은 FK 가 CASCADE 라 매장 삭제 시 광고 이력이 함께 지워진다 →
--     행이 하나라도 있으면 삭제 불가 (광고 이력 물리 삭제 금지 계약 · delivery-ad-audit.ts)

-- ---------------------------------------------------------------------------
-- 내부: RESTRICT / NO ACTION 참조 건수 (동적)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_sample_store_blocking_refs(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_count bigint;
  v_out jsonb := '[]'::jsonb;
BEGIN
  -- 1단계: stores 를 직접 참조하는 RESTRICT('r') / NO ACTION('a') FK
  FOR r IN
    SELECT c.conname::text AS conname,
           c.conrelid::regclass AS tbl,
           a.attname::text AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.stores'::regclass
      AND c.confdeltype IN ('r', 'a')
      AND array_length(c.conkey, 1) = 1
    ORDER BY 1
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col) INTO v_count USING p_store_id;
    IF v_count > 0 THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'constraint', r.conname, 'table', r.tbl::text, 'count', v_count, 'level', 1));
    END IF;
  END LOOP;

  -- 2단계: CASCADE 로 함께 지워지는 하위 테이블을 RESTRICT / NO ACTION 으로 참조하는 FK
  FOR r IN
    SELECT c2.conname::text AS conname,
           c2.conrelid::regclass AS tbl,
           a2.attname::text AS col,
           c1.conrelid::regclass AS mid,
           a1.attname::text AS mid_store_col,
           af.attname::text AS mid_ref_col
    FROM pg_constraint c1
    JOIN pg_attribute a1 ON a1.attrelid = c1.conrelid AND a1.attnum = c1.conkey[1]
    JOIN pg_constraint c2
      ON c2.contype = 'f'
     AND c2.confrelid = c1.conrelid
     AND c2.confdeltype IN ('r', 'a')
     AND array_length(c2.conkey, 1) = 1
    JOIN pg_attribute a2 ON a2.attrelid = c2.conrelid AND a2.attnum = c2.conkey[1]
    JOIN pg_attribute af ON af.attrelid = c2.confrelid AND af.attnum = c2.confkey[1]
    WHERE c1.contype = 'f'
      AND c1.confrelid = 'public.stores'::regclass
      AND c1.confdeltype = 'c'
      AND array_length(c1.conkey, 1) = 1
    ORDER BY 1
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %s t WHERE t.%I IN (SELECT m.%I FROM %s m WHERE m.%I = $1)',
      r.tbl, r.col, r.mid_ref_col, r.mid, r.mid_store_col
    ) INTO v_count USING p_store_id;
    IF v_count > 0 THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'constraint', r.conname, 'table', r.tbl::text, 'via', r.mid::text, 'count', v_count, 'level', 2));
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 내부: 매장 소유 이미지 경로 + 「삭제 후에도 남는 다른 행」 공유 여부
--   경로 = store-product-images/{storeId}/… (매장 폴더 원본·파생본). 공유 판정은 원본·파생본 공통 줄기
--   (확장자·.hero/.feed 등 파생 접미사 제거)로 한다 — 원본이 공유되면 파생본도 보존.
--   「다른 행」 = 다른 매장·다른 매장 상품/배너/공지/유료광고 + 매장 삭제 후에도 남는(SET NULL) 배너 캠페인·
--   광고 소재·플랫폼 광고·팝업·이벤트 행.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_sample_store_image_paths(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH own_src AS (
    SELECT to_jsonb(s)::text AS t FROM public.stores s WHERE s.id = p_store_id
    UNION ALL SELECT to_jsonb(p)::text FROM public.store_products p WHERE p.store_id = p_store_id
    UNION ALL SELECT to_jsonb(b)::text FROM public.store_banners b WHERE b.store_id = p_store_id
    UNION ALL SELECT to_jsonb(n)::text FROM public.store_notices n WHERE n.store_id = p_store_id
    UNION ALL SELECT to_jsonb(c)::text FROM public.store_paid_ad_campaigns c WHERE c.store_id = p_store_id
  ),
  paths AS (
    SELECT DISTINCT m[1] AS path
    FROM own_src,
         regexp_matches(
           own_src.t,
           'store-product-images/(' || p_store_id::text || '/[^"''[:space:]?#)<>,\\]+)',
           'g'
         ) AS m
  ),
  stems AS (
    SELECT path,
           regexp_replace(path, '(\.(thumb|feed|detail|hero)\.webp|\.[^./]+)$', '') AS stem
    FROM paths
  ),
  others AS (
    SELECT to_jsonb(s)::text AS t FROM public.stores s WHERE s.id <> p_store_id
    UNION ALL SELECT to_jsonb(p)::text FROM public.store_products p WHERE p.store_id <> p_store_id
    UNION ALL SELECT to_jsonb(b)::text FROM public.store_banners b WHERE b.store_id IS DISTINCT FROM p_store_id
    UNION ALL SELECT to_jsonb(n)::text FROM public.store_notices n WHERE n.store_id IS DISTINCT FROM p_store_id
    UNION ALL SELECT to_jsonb(c)::text FROM public.store_paid_ad_campaigns c WHERE c.store_id IS DISTINCT FROM p_store_id
    UNION ALL SELECT to_jsonb(c)::text FROM public.store_banner_ad_campaigns c
    UNION ALL SELECT to_jsonb(c)::text FROM public.delivery_ad_creatives c
    UNION ALL SELECT to_jsonb(c)::text FROM public.platform_ads c
    UNION ALL SELECT to_jsonb(c)::text FROM public.platform_popup_campaigns c
    UNION ALL SELECT to_jsonb(c)::text FROM public.platform_events c
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'path', st.path,
        'shared', EXISTS (SELECT 1 FROM others o WHERE strpos(o.t, st.stem) > 0)
      )
      ORDER BY st.path
    ),
    '[]'::jsonb
  )
  FROM stems st;
$$;

-- ---------------------------------------------------------------------------
-- 내부: 매장 1곳 사전 확인
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_sample_store_delete_preview_one(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store record;
  v_menu_count bigint;
  v_option_count bigint;
  v_section_count bigint;
  v_images jsonb;
  v_banner_campaigns jsonb;
  v_banner_live bigint;
  v_paid_count bigint;
  v_creative_count bigint;
  v_coupon_total bigint;
  v_coupon_live bigint;
  v_promo_total bigint;
  v_promo_active bigint;
  v_favorites bigint;
  v_refs jsonb;
  v_reasons text[] := ARRAY[]::text[];
BEGIN
  SELECT s.id, s.store_kind, s.store_name, s.slug, s.approval_status, s.is_visible
    INTO v_store
  FROM public.stores s
  WHERE s.id = p_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'store_id', p_store_id,
      'exists', false,
      'deletable', false,
      'reasons', jsonb_build_array('not_found')
    );
  END IF;

  SELECT count(*) INTO v_menu_count FROM public.store_products p WHERE p.store_id = p_store_id;

  SELECT coalesce(sum(
           CASE WHEN jsonb_typeof(g -> 'options') = 'array' THEN jsonb_array_length(g -> 'options') ELSE 0 END
         ), 0)
    INTO v_option_count
  FROM public.store_products p,
       jsonb_array_elements(
         CASE WHEN jsonb_typeof(p.options_json) = 'array' THEN p.options_json ELSE '[]'::jsonb END
       ) AS g
  WHERE p.store_id = p_store_id;

  SELECT count(*) INTO v_section_count FROM public.store_menu_sections m WHERE m.store_id = p_store_id;

  v_images := public.admin_sample_store_image_paths(p_store_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'lifecycle_status', c.lifecycle_status) ORDER BY c.created_at), '[]'::jsonb),
         count(*) FILTER (WHERE coalesce(c.lifecycle_status, '') NOT IN ('ENDED', 'ARCHIVED'))
    INTO v_banner_campaigns, v_banner_live
  FROM public.store_banner_ad_campaigns c
  WHERE c.store_id = p_store_id;

  SELECT count(*) INTO v_paid_count FROM public.store_paid_ad_campaigns c WHERE c.store_id = p_store_id;
  SELECT count(*) INTO v_creative_count FROM public.delivery_ad_creatives c WHERE c.store_id = p_store_id;

  SELECT count(*), count(*) FILTER (WHERE coalesce(c.lifecycle_state, '') IN ('active', 'paused'))
    INTO v_coupon_total, v_coupon_live
  FROM public.store_coupon_campaigns c
  WHERE c.store_id = p_store_id;

  SELECT count(*), count(*) FILTER (WHERE c.is_active)
    INTO v_promo_total, v_promo_active
  FROM public.store_discovery_campaigns c
  WHERE c.store_id = p_store_id;

  SELECT count(*) INTO v_favorites FROM public.store_favorites f WHERE f.store_id = p_store_id;

  v_refs := public.admin_sample_store_blocking_refs(p_store_id);

  IF v_store.store_kind IS DISTINCT FROM 'sample' THEN
    v_reasons := array_append(v_reasons, 'not_sample_store'::text);
  END IF;
  IF jsonb_array_length(v_refs) > 0 THEN
    v_reasons := array_append(v_reasons, 'restrict_references'::text);
  END IF;
  IF v_banner_live > 0 THEN
    v_reasons := array_append(v_reasons, 'ad_campaign_not_ended'::text);
  END IF;
  IF v_paid_count > 0 THEN
    v_reasons := array_append(v_reasons, 'paid_ad_history_would_cascade'::text);
  END IF;

  RETURN jsonb_build_object(
    'store_id', v_store.id,
    'exists', true,
    'store_kind', v_store.store_kind,
    'store_name', v_store.store_name,
    'slug', v_store.slug,
    'approval_status', v_store.approval_status,
    'is_visible', v_store.is_visible,
    'menu_count', v_menu_count,
    'option_count', v_option_count,
    'section_count', v_section_count,
    'images', v_images,
    'image_count', jsonb_array_length(v_images),
    'shared_image_count', (SELECT count(*) FROM jsonb_array_elements(v_images) e WHERE (e ->> 'shared')::boolean),
    'banner_campaigns', v_banner_campaigns,
    'banner_campaign_live_count', v_banner_live,
    'paid_campaign_count', v_paid_count,
    'ad_creative_count', v_creative_count,
    'coupon_count', v_coupon_total,
    'coupon_live_count', v_coupon_live,
    'promotion_count', v_promo_total,
    'promotion_active_count', v_promo_active,
    'favorite_count', v_favorites,
    'blocking_refs', v_refs,
    'deletable', cardinality(v_reasons) = 0,
    'reasons', to_jsonb(v_reasons)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- DB-4 사전 확인 (읽기 전용) — 요청 순서대로 매장별 jsonb 배열
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_sample_store_delete_preview(p_store_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    jsonb_agg(public.admin_sample_store_delete_preview_one(x.id) ORDER BY x.ord),
    '[]'::jsonb
  )
  FROM (
    SELECT DISTINCT ON (u.id) u.id, u.ord
    FROM unnest(coalesce(p_store_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS u(id, ord)
    WHERE u.id IS NOT NULL
    ORDER BY u.id, u.ord
  ) x;
$$;

-- ---------------------------------------------------------------------------
-- DB-5 샘플 매장 1곳 삭제 — FOR UPDATE → 재검증 → 삭제 전 이미지 경로 수집 → DELETE → 경로 반환
-- 호출부(서버 API)가 매장마다 개별 호출 = 매장별 개별 트랜잭션.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_sample_store(p_store_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store record;
  v_preview jsonb;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'store_id_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'actor_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT s.id, s.store_kind, s.store_name, s.slug
    INTO v_store
  FROM public.stores s
  WHERE s.id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'already_deleted', 'store_id', p_store_id);
  END IF;

  IF v_store.store_kind IS DISTINCT FROM 'sample' THEN
    RETURN jsonb_build_object(
      'status', 'blocked',
      'store_id', p_store_id,
      'store_kind', v_store.store_kind,
      'reasons', jsonb_build_array('not_sample_store')
    );
  END IF;

  -- 잠금 후 재검증 (미리보기 이후 바뀐 연결 데이터 포함)
  v_preview := public.admin_sample_store_delete_preview_one(p_store_id);
  IF coalesce((v_preview ->> 'deletable')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'status', 'blocked',
      'store_id', p_store_id,
      'store_kind', v_store.store_kind,
      'reasons', coalesce(v_preview -> 'reasons', '[]'::jsonb),
      'blocking_refs', coalesce(v_preview -> 'blocking_refs', '[]'::jsonb)
    );
  END IF;

  DELETE FROM public.stores WHERE id = p_store_id;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'store_id', p_store_id,
    'store_name', v_store.store_name,
    'slug', v_store.slug,
    'actor', p_actor,
    'menu_count', v_preview -> 'menu_count',
    'option_count', v_preview -> 'option_count',
    'section_count', v_preview -> 'section_count',
    'image_count', v_preview -> 'image_count',
    'images', coalesce(v_preview -> 'images', '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- DB-6 stores BEFORE DELETE 보호 — 샘플이 아닌 매장은 어떤 경로(SQL 직접 포함)로도 삭제 불가
-- (현재 코드에 stores 삭제 경로 0건 — 기존 기능 영향 없음)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stores_block_non_sample_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.store_kind IS DISTINCT FROM 'sample' THEN
    RAISE EXCEPTION 'non_sample_store_delete_forbidden' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_stores_block_non_sample_delete ON public.stores;
CREATE TRIGGER trg_stores_block_non_sample_delete
  BEFORE DELETE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.stores_block_non_sample_delete();

-- ---------------------------------------------------------------------------
-- 권한 — service_role 만 실행 (서버 API 경유). anon / authenticated / PUBLIC 차단.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_sample_store_blocking_refs(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_sample_store_image_paths(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_sample_store_delete_preview_one(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_sample_store_delete_preview(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_sample_store(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stores_block_non_sample_delete() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_sample_store_blocking_refs(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_sample_store_image_paths(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_sample_store_delete_preview_one(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_sample_store_delete_preview(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_sample_store(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.admin_sample_store_delete_preview(uuid[]) IS
  '3-C §9-4 DB-4 — 샘플 매장 삭제 사전 확인(읽기). 매장별 메뉴·옵션·섹션·이미지(공유 여부)·광고·쿠폰·프로모션·찜·RESTRICT/NO ACTION 참조(동적)·삭제 가능 여부.';
COMMENT ON FUNCTION public.admin_delete_sample_store(uuid, uuid) IS
  '3-C §9-4 DB-5 — 샘플 매장 1곳 삭제 (FOR UPDATE · 재검증 · 이미지 경로 반환). service_role 전용.';
COMMENT ON FUNCTION public.stores_block_non_sample_delete() IS
  '3-C §9-4 DB-6 — store_kind <> sample 매장 삭제 차단.';
