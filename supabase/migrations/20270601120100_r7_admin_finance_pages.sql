-- R7 잔여 — 재무 목록 서버 페이지 (고정 조회 상한 제거). 금전 데이터는 읽기만 한다.
--
-- 목적 · 대상 화면:
--   1. admin_finance_unified_tx_page — /admin/finance/transactions (GET /api/admin/finance/transactions)
--      현금(business_cash_ledger)·코인(store_economic_point_ledger)·포인트(point_ledger) 세 원장을 원장별
--      최신 N건씩 읽어 메모리에서 합치고 100건으로 자르던 경로 → DB 한 번(UNION ALL → 필터 → 정렬 → 페이지 + total).
--      필터 규칙은 load-unified-transactions.ts 기존 규칙 그대로:
--        storeId = 현금·코인만 (매장 지정 시 포인트 제외) · memberId = 포인트만 · orderId = 현금(related_id 부분 일치)·
--        코인(related_id = id 또는 idempotency_key = 'sale_coin:'||id) · type = entry_kind (포인트는 화면 유형 또는 entry_type) ·
--        direction · adId(ad_id 또는 related_id 일치) · 기간(created_at ≥ from, ≤ to). p_tx_id = 상세 1건(txKey).
--      포인트 화면 유형(POINT_*)·방향·광고 id 판정을 여기서 계산해 필터·표시가 같은 값을 쓴다.
--   2. admin_finance_store_activity_page — /admin/finance/stores (GET /api/admin/finance/stores-index)
--      통합 거래 최신 120건에서 매장 24개를 뽑던 경로 → 현금·코인 원장 활동이 있는 전체 매장을
--      최근 활동 순으로 페이지 + total. 최근 유형 = 매장별 최근 entry_kind 3개.
--   3. admin_finance_ad_funding_page — /admin/finance/ads (GET /api/admin/finance/ad-funding-traces)
--      다섯 출처(delivery_ad_canonical_bc_fundings · feed_ad_requests(+feed_ad_point_holds) ·
--      point_promotion_orders · platform_popup_campaigns)를 출처별 최신 N건씩 읽어 합치고 80건으로 자르던 경로
--      → DB 한 번. 운영 열 기준: 매장 사장 = stores.owner_user_id · 홍보 주문 상태 = order_status ·
--      관리자 직접 팝업 = owner_request_id IS NULL (매장 신청 팝업은 Cash 결제 행으로 이미 나온다) ·
--      팝업 노출 = start_at/end_at. 정렬 = coalesce(노출 시작, 승인 시각, 생성 시각) DESC.
-- 정렬은 모두 결정적(동률 시 출처·id) — 페이지 이동 시 누락·중복 없음. 페이지 크기 1..100.
-- 권한: SECURITY DEFINER · search_path=public · PUBLIC/anon/authenticated EXECUTE 회수 · service_role 만 실행
--       (앱 서버가 requireAdminPermission("business") 통과 후 service role 로 호출).
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_finance_unified_tx_page(text, text, text, uuid, text, text, uuid, timestamptz, timestamptz, uuid, integer, integer);
--   DROP FUNCTION IF EXISTS public.admin_finance_store_activity_page(integer, integer);
--   DROP FUNCTION IF EXISTS public.admin_finance_ad_funding_page(uuid, uuid, text, integer, integer);
--   DROP INDEX IF EXISTS public.business_cash_ledger_created_id_idx;
--   DROP INDEX IF EXISTS public.store_economic_point_ledger_created_id_idx;
--   DROP INDEX IF EXISTS public.point_ledger_created_id_idx;
--   DROP INDEX IF EXISTS public.delivery_ad_canonical_bc_fundings_created_id_idx;

CREATE INDEX IF NOT EXISTS business_cash_ledger_created_id_idx
  ON public.business_cash_ledger (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS store_economic_point_ledger_created_id_idx
  ON public.store_economic_point_ledger (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS point_ledger_created_id_idx
  ON public.point_ledger (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS delivery_ad_canonical_bc_fundings_created_id_idx
  ON public.delivery_ad_canonical_bc_fundings (created_at DESC, id DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 통합 거래
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_finance_unified_tx_page(
  p_wallet text,
  p_type text,
  p_direction text,
  p_store_id uuid,
  p_order_id text,
  p_ad_id text,
  p_member_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tx_id uuid,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    SELECT
      'CASH'::text AS wallet,
      b.id,
      b.created_at,
      b.entry_kind,
      NULL::text AS type_alt,
      CASE WHEN lower(b.direction) = 'credit' THEN 'credit' ELSE 'debit' END AS direction,
      CASE
        WHEN strpos(lower(b.related_type), 'delivery') > 0
          OR strpos(lower(b.related_type), 'ad') > 0
          OR strpos(upper(b.entry_kind), 'AD_') > 0
          OR strpos(upper(b.entry_kind), 'PARTNER_') > 0
        THEN coalesce(nullif(b.related_id, ''), nullif(b.meta ->> 'application_id', ''), nullif(b.meta ->> 'ad_id', ''))
      END AS ad_id,
      b.related_id,
      jsonb_build_object(
        'id', b.id,
        'store_id', b.store_id,
        'entry_kind', b.entry_kind,
        'direction', b.direction,
        'amount_minor', b.amount_minor,
        'balance_after_minor', b.balance_after_minor,
        'related_type', b.related_type,
        'related_id', b.related_id,
        'actor_user_id', b.actor_user_id,
        'meta', b.meta,
        'created_at', b.created_at
      ) AS row
    FROM public.business_cash_ledger b
    WHERE coalesce(p_wallet, '') IN ('', 'CASH')
      AND (p_store_id IS NULL OR b.store_id = p_store_id)
      AND (p_from IS NULL OR b.created_at >= p_from)
      AND (p_to IS NULL OR b.created_at <= p_to)
      AND (coalesce(p_order_id, '') = '' OR strpos(lower(b.related_id), lower(p_order_id)) > 0)
      AND (p_tx_id IS NULL OR b.id = p_tx_id)
    UNION ALL
    SELECT
      'COIN'::text,
      s.id,
      s.created_at,
      s.entry_kind,
      NULL::text,
      CASE WHEN s.amount >= 0 THEN 'credit' ELSE 'debit' END,
      NULL::text,
      s.related_id,
      jsonb_build_object(
        'id', s.id,
        'store_id', s.store_id,
        'entry_kind', s.entry_kind,
        'amount', s.amount,
        'balance_after', s.balance_after,
        'related_type', s.related_type,
        'related_id', s.related_id,
        'actor_user_id', s.actor_user_id,
        'meta', s.meta,
        'created_at', s.created_at
      )
    FROM public.store_economic_point_ledger s
    WHERE coalesce(p_wallet, '') IN ('', 'COIN')
      AND (p_store_id IS NULL OR s.store_id = p_store_id)
      AND (p_from IS NULL OR s.created_at >= p_from)
      AND (p_to IS NULL OR s.created_at <= p_to)
      AND (
        coalesce(p_order_id, '') = ''
        OR s.related_id = p_order_id
        OR s.idempotency_key = 'sale_coin:' || p_order_id
      )
      AND (p_tx_id IS NULL OR s.id = p_tx_id)
    UNION ALL
    SELECT
      'POINT'::text,
      p.id,
      p.created_at,
      CASE
        WHEN p.entry_type ~* 'charge|top.?up' OR p.related_type ~* 'charge' THEN 'POINT_CHARGE'
        WHEN p.entry_type ~* 'hold' OR p.related_type ~* 'hold' THEN 'POINT_HOLD'
        WHEN p.entry_type ~* 'capture|purchase' THEN 'POINT_CAPTURE'
        WHEN p.entry_type ~* 'release' THEN 'POINT_RELEASE'
        WHEN p.entry_type ~* 'reward|grant|credit' THEN 'POINT_REWARD'
        WHEN p.entry_type ~* 'reclaim' THEN 'POINT_RECLAIM'
        WHEN p.entry_type ~* 'refund' THEN 'POINT_REFUND'
        WHEN p.amount > 0 THEN 'POINT_REWARD'
        ELSE 'POINT_SPEND'
      END,
      p.entry_type,
      CASE WHEN p.amount >= 0 THEN 'credit' ELSE 'debit' END,
      CASE
        WHEN p.related_type ~* 'ad|feed|promotion|boost' OR p.entry_type ~* 'ad|feed|promotion|boost'
        THEN nullif(p.related_id, '')
      END,
      p.related_id,
      jsonb_build_object(
        'id', p.id,
        'user_id', p.user_id,
        'entry_type', p.entry_type,
        'amount', p.amount,
        'balance_after', p.balance_after,
        'related_type', p.related_type,
        'related_id', p.related_id,
        'description', p.description,
        'created_at', p.created_at
      )
    FROM public.point_ledger p
    WHERE coalesce(p_wallet, '') IN ('', 'POINT')
      AND p_store_id IS NULL
      AND (p_member_id IS NULL OR p.user_id = p_member_id)
      AND (p_from IS NULL OR p.created_at >= p_from)
      AND (p_to IS NULL OR p.created_at <= p_to)
      AND (p_tx_id IS NULL OR p.id = p_tx_id)
  ),
  f AS (
    SELECT *
      FROM u
     WHERE (coalesce(p_type, '') = '' OR u.entry_kind = p_type OR u.type_alt = p_type)
       AND (coalesce(p_direction, '') = '' OR u.direction = p_direction)
       AND (coalesce(p_ad_id, '') = '' OR u.ad_id = p_ad_id OR u.related_id = p_ad_id)
  ),
  pg AS (
    SELECT *
      FROM f
     ORDER BY f.created_at DESC, f.wallet, f.id DESC
     LIMIT greatest(least(coalesce(p_limit, 20), 100), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'rows', coalesce(
      (SELECT jsonb_agg(
                jsonb_build_object(
                  'wallet', pg.wallet,
                  'id', pg.id,
                  'created_at', pg.created_at,
                  'entry_kind', pg.entry_kind,
                  'direction', pg.direction,
                  'ad_id', pg.ad_id,
                  'row', pg.row)
                ORDER BY pg.created_at DESC, pg.wallet, pg.id DESC)
         FROM pg),
      '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_finance_unified_tx_page(text, text, text, uuid, text, text, uuid, timestamptz, timestamptz, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finance_unified_tx_page(text, text, text, uuid, text, text, uuid, timestamptz, timestamptz, uuid, integer, integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 매장별 재무 — 활동 매장 목록
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_finance_store_activity_page(
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH st AS (
    SELECT x.store_id, max(x.created_at) AS last_at
      FROM (
        SELECT b.store_id, b.created_at FROM public.business_cash_ledger b
        UNION ALL
        SELECT s.store_id, s.created_at FROM public.store_economic_point_ledger s
      ) x
     GROUP BY x.store_id
  ),
  pg AS (
    SELECT *
      FROM st
     ORDER BY st.last_at DESC, st.store_id
     LIMIT greatest(least(coalesce(p_limit, 20), 100), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM st),
    'rows', coalesce(
      (SELECT jsonb_agg(
                jsonb_build_object(
                  'store_id', pg.store_id,
                  'store_name', s.store_name,
                  'last_at', pg.last_at,
                  'sample_kinds', coalesce(k.kinds, '[]'::jsonb))
                ORDER BY pg.last_at DESC, pg.store_id)
         FROM pg
         LEFT JOIN public.stores s ON s.id = pg.store_id
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(kk.entry_kind ORDER BY kk.k_last DESC, kk.entry_kind) AS kinds
             FROM (
               SELECT y.entry_kind, max(y.created_at) AS k_last
                 FROM (
                   SELECT b.entry_kind, b.created_at FROM public.business_cash_ledger b WHERE b.store_id = pg.store_id
                   UNION ALL
                   SELECT s2.entry_kind, s2.created_at FROM public.store_economic_point_ledger s2 WHERE s2.store_id = pg.store_id
                 ) y
                GROUP BY y.entry_kind
                ORDER BY max(y.created_at) DESC, y.entry_kind
                LIMIT 3
             ) kk
         ) k ON true),
      '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_finance_store_activity_page(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finance_store_activity_page(integer, integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 광고 자금 추적
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_finance_ad_funding_page(
  p_store_id uuid,
  p_member_id uuid,
  p_rail text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    SELECT
      'delivery_ad_canonical_bc_fundings'::text AS source,
      f.id,
      f.created_at AS sort_at,
      jsonb_build_object(
        'id', f.id,
        'application_id', f.application_id,
        'store_id', f.store_id,
        'owner_user_id', st.owner_user_id,
        'product_kind', f.product_kind,
        'status', f.status,
        'amount_minor', f.amount_minor,
        'spend_ledger_id', f.spend_ledger_id,
        'refund_ledger_id', f.refund_ledger_id,
        'created_at', f.created_at
      ) AS row
    FROM public.delivery_ad_canonical_bc_fundings f
    LEFT JOIN public.stores st ON st.id = f.store_id
    WHERE coalesce(p_rail, '') IN ('', 'STORE_CASH')
      AND (p_store_id IS NULL OR f.store_id = p_store_id)
    UNION ALL
    SELECT
      'feed_ad_requests'::text,
      r.id,
      coalesce(r.reviewed_at, r.created_at),
      jsonb_build_object(
        'id', r.id,
        'user_id', r.user_id,
        'status', r.status,
        'point_cost', r.point_cost,
        'domain', r.domain,
        'reviewed_at', r.reviewed_at,
        'reviewed_by', r.reviewed_by,
        'hold_id', h.id,
        'hold_status', h.status,
        'created_at', r.created_at
      )
    FROM public.feed_ad_requests r
    LEFT JOIN LATERAL (
      SELECT h1.id, h1.status
        FROM public.feed_ad_point_holds h1
       WHERE h1.request_id = r.id
       ORDER BY h1.created_at DESC, h1.id DESC
       LIMIT 1
    ) h ON true
    WHERE coalesce(p_rail, '') IN ('', 'MEMBER_POINT')
      AND p_store_id IS NULL
      AND (p_member_id IS NULL OR r.user_id = p_member_id)
    UNION ALL
    SELECT
      'point_promotion_orders'::text,
      o.id,
      coalesce(o.start_at, o.created_at),
      jsonb_build_object(
        'id', o.id,
        'user_id', o.user_id,
        'status', o.order_status,
        'point_cost', o.point_cost,
        'domain', o.domain,
        'start_at', o.start_at,
        'end_at', o.end_at,
        'created_at', o.created_at
      )
    FROM public.point_promotion_orders o
    WHERE coalesce(p_rail, '') IN ('', 'MEMBER_POINT')
      AND p_store_id IS NULL
      AND (p_member_id IS NULL OR o.user_id = p_member_id)
    UNION ALL
    SELECT
      'platform_popup_campaigns'::text,
      c.id,
      coalesce(c.start_at, c.created_at),
      jsonb_build_object(
        'id', c.id,
        'status', c.status,
        'created_by', c.created_by,
        'start_at', c.start_at,
        'end_at', c.end_at,
        'created_at', c.created_at
      )
    FROM public.platform_popup_campaigns c
    WHERE coalesce(p_rail, '') IN ('', 'ADMIN_DIRECT')
      AND p_store_id IS NULL
      AND p_member_id IS NULL
      AND c.owner_request_id IS NULL
  ),
  pg AS (
    SELECT *
      FROM u
     ORDER BY u.sort_at DESC, u.source, u.id DESC
     LIMIT greatest(least(coalesce(p_limit, 20), 100), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM u),
    'rows', coalesce(
      (SELECT jsonb_agg(
                jsonb_build_object('source', pg.source, 'id', pg.id, 'sort_at', pg.sort_at, 'row', pg.row)
                ORDER BY pg.sort_at DESC, pg.source, pg.id DESC)
         FROM pg),
      '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_finance_ad_funding_page(uuid, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finance_ad_funding_page(uuid, uuid, text, integer, integer) TO service_role;
