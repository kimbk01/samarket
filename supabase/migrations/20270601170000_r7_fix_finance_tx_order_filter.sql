-- R7 실측 F1 — 전체 거래(/admin/finance/transactions) 주문 ID 필터가 포인트 원장 행에 걸리지 않던 결함 수정.
-- 원인: admin_finance_unified_tx_page 의 POINT 분기에 p_order_id 조건이 없어, 주문 ID 로 거르면
--       현금·코인 행은 걸러지고 주문과 무관한 포인트 행은 전부 섞여 나왔다 (실측: 635 → 512, 일치 1행).
-- 수정: POINT 분기에 related_id = p_order_id 조건 추가 (주문 ID 미지정 시 동작 그대로). 나머지 본문은 20270601120100 과 같다.
-- 권한·시그니처 변경 없음 (CREATE OR REPLACE 는 기존 GRANT 유지).
-- 롤백: 20270601120100 의 admin_finance_unified_tx_page 본문을 다시 적용.

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
      -- 주문 ID 필터: 포인트 원장은 주문 연결 열이 related_id 뿐 — 일치하는 행만 남긴다 (주문과 무관한 포인트 행 제외).
      AND (coalesce(p_order_id, '') = '' OR p.related_id = p_order_id)
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
