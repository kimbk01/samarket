-- R7 (delivery_b) — 수수료 정책 `/admin/store-fee-policies` 고정 조회 상한 제거
--
-- 목적: 개요 API 가 매장을 `limit(2000)`·정책을 `limit(500)` 까지만 읽고, 매장마다 TS 해석기를 순차 호출해
--       요약(적용 구분별 매장 수)·업종/세부업종별 매장 수·매장 목록을 메모리에서 만들던 경로를 DB 로 옮긴다.
--   · admin_store_fee_overview_summary(): 전체 매장 기준 적용 구분 집계 + 업종/세부업종별 매장 수 + 예약·비활성 정책 수
--   · admin_store_fee_store_page(q, category, limit, offset): 매장 탭 서버 페이지 (검색·업종 필터·결정적 정렬
--     store_name, id · 정확한 total) + 행마다 유효 정책과 단계(매장·세부업종·업종) 정책
-- 대상 화면: /admin/store-fee-policies (GET /api/admin/store-fee-policies/overview · ?section=stores)
-- 해석 규칙: 유효 정책은 기존 SSOT 함수 public.store_commission_resolve_policy(store_id) 를 그대로 호출한다
--   (docs/store-commission-cash-settlement-ssot.md · lib/stores/commission/store-commission-contract.ts).
--   단계 정책 표시는 같은 함수와 같은 조건·순서(priority ASC, starts_at DESC NULLS FIRST, created_at DESC).
-- 조회 전용 — 수수료 금액 계산·저장·정책 쓰기 없음.
--
-- 권한: SECURITY DEFINER · search_path=public · PUBLIC/anon/authenticated EXECUTE 회수 · service_role 만 실행.
--
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_store_fee_store_page(text, uuid, integer, integer);
--   DROP FUNCTION IF EXISTS public.admin_store_fee_overview_summary();
--   DROP FUNCTION IF EXISTS public.admin_store_fee_active_policy_json(uuid, uuid, uuid, text);

-- 단계별 활성 정책 1건 (store_commission_resolve_policy 와 같은 조건·순서) → 표시용 jsonb.
-- p_level: 'store' | 'topic' | 'category' | 'default'
CREATE OR REPLACE FUNCTION public.admin_store_fee_active_policy_json(
  p_store_id uuid,
  p_topic_id uuid,
  p_category_id uuid,
  p_level text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
           'policy_id', p.id,
           'policy_name', p.policy_name,
           'fee_percent', p.fee_percent,
           'fixed_fee', p.fixed_fee,
           'starts_at', p.starts_at,
           'memo', p.memo,
           'updated_at', p.updated_at)
    FROM public.store_fee_policies p
   WHERE p.is_active AND NOT coalesce(p.is_archived, false)
     AND (p.starts_at IS NULL OR p.starts_at <= now()) AND (p.ends_at IS NULL OR p.ends_at > now())
     AND CASE p_level
           WHEN 'store' THEN p_store_id IS NOT NULL AND p.store_id = p_store_id
           WHEN 'topic' THEN p_topic_id IS NOT NULL AND p.store_id IS NULL AND p.topic_id = p_topic_id
           WHEN 'category' THEN p_category_id IS NOT NULL AND p.store_id IS NULL AND p.topic_id IS NULL
                                AND p.category_id = p_category_id
           WHEN 'default' THEN p.store_id IS NULL AND p.topic_id IS NULL AND p.category_id IS NULL
           ELSE false
         END
   ORDER BY p.priority ASC, p.starts_at DESC NULLS FIRST, p.created_at DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.admin_store_fee_active_policy_json(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_fee_active_policy_json(uuid, uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_store_fee_overview_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH st AS (
    SELECT s.id, s.store_category_id, s.store_topic_id,
           public.store_commission_resolve_policy(s.id)->>'scope' AS scope,
           public.admin_store_fee_active_policy_json(s.id, NULL, NULL, 'store') IS NOT NULL AS has_override,
           public.admin_store_fee_active_policy_json(NULL, s.store_topic_id, NULL, 'topic') IS NOT NULL AS topic_active
      FROM public.stores s
  )
  SELECT jsonb_build_object(
    'stores_total', (SELECT count(*) FROM st),
    'applied_default', (SELECT count(*) FROM st WHERE scope = 'default'),
    'applied_category', (SELECT count(*) FROM st WHERE scope = 'category'),
    'applied_topic', (SELECT count(*) FROM st WHERE scope = 'topic'),
    'applied_store', (SELECT count(*) FROM st WHERE scope = 'store'),
    'missing_policy', (SELECT count(*) FROM st WHERE scope IS NULL),
    'reserved_future', (
      SELECT count(*) FROM public.store_fee_policies p
       WHERE p.is_active AND NOT coalesce(p.is_archived, false) AND p.starts_at > now()
    ),
    'inactive_policies', (
      SELECT count(*) FROM public.store_fee_policies p
       WHERE NOT p.is_active AND NOT coalesce(p.is_archived, false)
    ),
    'categories', coalesce((
      SELECT jsonb_object_agg(x.store_category_id, jsonb_build_object(
               'store_count', x.store_count,
               'override_store_count', x.override_store_count,
               'topic_wins_store_count', x.topic_wins_store_count))
        FROM (
          SELECT store_category_id,
                 count(*) AS store_count,
                 count(*) FILTER (WHERE has_override) AS override_store_count,
                 count(*) FILTER (WHERE NOT has_override AND topic_active) AS topic_wins_store_count
            FROM st WHERE store_category_id IS NOT NULL GROUP BY store_category_id
        ) x
    ), '{}'::jsonb),
    'topics', coalesce((
      SELECT jsonb_object_agg(x.store_topic_id, jsonb_build_object(
               'store_count', x.store_count,
               'override_store_count', x.override_store_count))
        FROM (
          SELECT store_topic_id,
                 count(*) AS store_count,
                 count(*) FILTER (WHERE has_override) AS override_store_count
            FROM st WHERE store_topic_id IS NOT NULL GROUP BY store_topic_id
        ) x
    ), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_store_fee_overview_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_fee_overview_summary() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_store_fee_store_page(
  p_q text,
  p_category_id uuid,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT nullif(lower(btrim(coalesce(p_q, ''))), '') AS q,
           LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  base AS (
    SELECT s.id, s.store_name, s.slug, s.store_category_id, s.store_topic_id,
           c.name AS category_name, t.name AS topic_name
      FROM public.stores s
      LEFT JOIN public.store_categories c ON c.id = s.store_category_id
      LEFT JOIN public.store_topics t ON t.id = s.store_topic_id
  ),
  filtered AS (
    SELECT b.*
      FROM base b
     CROSS JOIN params pr
     WHERE (p_category_id IS NULL OR b.store_category_id = p_category_id)
       AND (pr.q IS NULL
            OR strpos(lower(b.store_name), pr.q) > 0
            OR strpos(lower(coalesce(b.slug, '')), pr.q) > 0
            OR strpos(lower(coalesce(b.category_name, '')), pr.q) > 0
            OR strpos(lower(coalesce(b.topic_name, '')), pr.q) > 0)
  ),
  page AS (
    SELECT f.*
      FROM filtered f
     ORDER BY f.store_name, f.id
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'limit', (SELECT lim FROM params),
    'offset', (SELECT off FROM params),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'store_id', pg.id,
               'store_name', pg.store_name,
               'slug', pg.slug,
               'category_id', pg.store_category_id,
               'category_name', pg.category_name,
               'topic_id', pg.store_topic_id,
               'topic_name', pg.topic_name,
               'effective', public.store_commission_resolve_policy(pg.id) - 'raw',
               'store_policy', public.admin_store_fee_active_policy_json(pg.id, NULL, NULL, 'store'),
               'topic_policy', public.admin_store_fee_active_policy_json(NULL, pg.store_topic_id, NULL, 'topic'),
               'category_policy', public.admin_store_fee_active_policy_json(NULL, NULL, pg.store_category_id, 'category')
             ) ORDER BY pg.store_name, pg.id)
        FROM page pg
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_store_fee_store_page(text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_fee_store_page(text, uuid, integer, integer) TO service_role;
