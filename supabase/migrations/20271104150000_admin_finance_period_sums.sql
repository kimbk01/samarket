-- 재감사 C-1 (Owner 「1단계부터 진행」 2026-11-04) — 관리자 재무 화면 기간 계산 합계 (「Coin 전환 얼마 · 출금 얼마」).
-- 지시: 「각각의 … 어드민의 포인트 캐쉬 코인등의 내역 … 코인 전환 얼마? 코인 출금 얼마?? 이런 형식으로 계산된 내용이 나오는 구조」 (Owner 2026-11-03)
-- 기존 목록 함수의 거르기·정렬·페이지·기존 키는 한 글자도 바꾸지 않고, 같은 조건 전체의 합계만 더 돌려준다. 데이터 변경 없음.
--
-- 1. admin_finance_unified_tx_page — 'sums_by_kind' 추가: [{wallet, entry_kind, direction, count, amount, coin_out}]
--    amount = Cash amount_minor(부호 없음·방향은 direction) · Coin/Point amount(부호 있음). coin_out = Coin→Cash 전환(Cash 입금 줄)의 meta.sp_debited.
--    화면: /admin/finance/transactions(통합 거래) · /admin/finance/conversions(Coin 전환).
-- 2. admin_finance_ad_funding_page(7 인자) — 기간(p_from·p_to, 정렬 기준 시각과 같은 sort_at) + 'sums_by_source': [{source, status, count, amount}].
--    5 인자 구 함수는 그대로 둔다(배포 전 구 서버 호환). amount = Cash amount_minor · Point point_cost · 팝업 0.
--    화면: /admin/finance/ads(광고 지출).
-- 3. admin_finance_outstanding_sums(p_store_id) — 미납 목록과 같은 조건(매장 지정 = 그 매장 전 상태 · 없으면 open 전체)의 합계·상태별.
--    화면: /admin/finance/outstanding.
-- 4. admin_point_ledger_sums(p_user_id, p_sign, p_from, p_to) — 포인트 원장 목록(/admin/points/ledger)과 같은 조건
--    (캡처 감사 줄 숨김 = lib/points/point-period-history.ts POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR) 의 종류별 합계.
--    결과 모양 = admin_point_ledger_domain_page 의 sums_by_kind (TS adminPointBucketsFromSumsByKind 그대로).
-- 권한: SECURITY DEFINER · search_path=public · service_role 만 실행.
-- 롤백: 1 = 20270601172000 본문 재적용 · 2·3·4 = DROP FUNCTION (아래 서명).

BEGIN;

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
      ) AS row,
      b.amount_minor::numeric AS amt,
      CASE WHEN b.entry_kind = 'CONVERT_FROM_STORE_POINTS' AND (b.meta ->> 'sp_debited') ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN abs((b.meta ->> 'sp_debited')::numeric) ELSE 0 END AS coin_out
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
      ),
      s.amount::numeric,
      0::numeric
    FROM public.store_economic_point_ledger s
    WHERE coalesce(p_wallet, '') IN ('', 'COIN')
      AND (p_store_id IS NULL OR s.store_id = p_store_id)
      AND (p_from IS NULL OR s.created_at >= p_from)
      AND (p_to IS NULL OR s.created_at <= p_to)
      -- 주문 ID 는 현금 원장과 같은 부분 일치 (화면에 주문 UUID 앞자리만 넣어도 같은 주문의 Coin 행이 나온다).
      AND (
        coalesce(p_order_id, '') = ''
        OR strpos(lower(s.related_id), lower(p_order_id)) > 0
        OR strpos(lower(s.idempotency_key), lower('sale_coin:' || p_order_id)) > 0
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
      ),
      p.amount::numeric,
      0::numeric
    FROM public.point_ledger p
    WHERE coalesce(p_wallet, '') IN ('', 'POINT')
      AND p_store_id IS NULL
      AND (p_member_id IS NULL OR p.user_id = p_member_id)
      -- 주문 ID 필터: 포인트 원장은 주문 연결 열이 related_id 뿐 — 현금·Coin 과 같은 부분 일치 (주문과 무관한 포인트 행 제외).
      AND (coalesce(p_order_id, '') = '' OR strpos(lower(p.related_id), lower(p_order_id)) > 0)
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
    'sums_by_kind', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'wallet', g.wallet,
               'entry_kind', g.entry_kind,
               'direction', g.direction,
               'count', g.n,
               'amount', g.amount,
               'coin_out', g.coin_out) ORDER BY g.wallet, g.entry_kind, g.direction)
        FROM (
          SELECT f.wallet, f.entry_kind, f.direction, count(*) AS n,
                 coalesce(sum(f.amt), 0) AS amount, coalesce(sum(f.coin_out), 0) AS coin_out
            FROM f
           GROUP BY f.wallet, f.entry_kind, f.direction
        ) g
    ), '[]'::jsonb),
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
-- 2. 광고 지출 — 기간 + 출처·상태별 합계
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_finance_ad_funding_page(
  p_store_id uuid,
  p_member_id uuid,
  p_rail text,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u0 AS (
    SELECT
      'delivery_ad_canonical_bc_fundings'::text AS source,
      f.id,
      f.created_at AS sort_at,
      f.status::text AS status,
      f.amount_minor::numeric AS amt,
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
      r.status::text,
      coalesce(r.point_cost, 0)::numeric,
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
      o.order_status::text,
      coalesce(o.point_cost, 0)::numeric,
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
      c.status::text,
      0::numeric,
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
  u AS (
    -- 기간 = 목록 정렬 기준 시각(sort_at) — 통합 거래와 같은 경계(from 이상 · to 이하)
    SELECT * FROM u0
     WHERE (p_from IS NULL OR u0.sort_at >= p_from)
       AND (p_to IS NULL OR u0.sort_at <= p_to)
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
    'sums_by_source', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'source', g.source, 'status', g.status, 'count', g.n, 'amount', g.amount)
               ORDER BY g.source, g.status)
        FROM (
          SELECT u.source, coalesce(u.status, '') AS status, count(*) AS n, coalesce(sum(u.amt), 0) AS amount
            FROM u
           GROUP BY u.source, coalesce(u.status, '')
        ) g
    ), '[]'::jsonb),
    'rows', coalesce(
      (SELECT jsonb_agg(
                jsonb_build_object('source', pg.source, 'id', pg.id, 'sort_at', pg.sort_at, 'row', pg.row)
                ORDER BY pg.sort_at DESC, pg.source, pg.id DESC)
         FROM pg),
      '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_finance_ad_funding_page(uuid, uuid, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finance_ad_funding_page(uuid, uuid, text, timestamptz, timestamptz, integer, integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 미납 수수료 목록 합계
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_finance_outstanding_sums(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH f AS (
    SELECT o.status, o.fee_due_minor, o.fee_paid_minor, o.fee_outstanding_minor
      FROM public.store_sale_fee_obligations o
     WHERE CASE WHEN p_store_id IS NULL THEN o.status = 'open' ELSE o.store_id = p_store_id END
  )
  SELECT jsonb_build_object(
    'count', (SELECT count(*) FROM f),
    'due_minor', (SELECT coalesce(sum(f.fee_due_minor), 0) FROM f),
    'paid_minor', (SELECT coalesce(sum(f.fee_paid_minor), 0) FROM f),
    'outstanding_minor', (SELECT coalesce(sum(f.fee_outstanding_minor), 0) FROM f),
    'by_status', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'status', g.status, 'count', g.n, 'due_minor', g.due, 'paid_minor', g.paid,
               'outstanding_minor', g.outstanding) ORDER BY g.status)
        FROM (
          SELECT coalesce(f.status, '') AS status, count(*) AS n,
                 coalesce(sum(f.fee_due_minor), 0) AS due, coalesce(sum(f.fee_paid_minor), 0) AS paid,
                 coalesce(sum(f.fee_outstanding_minor), 0) AS outstanding
            FROM f GROUP BY coalesce(f.status, '')
        ) g
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_finance_outstanding_sums(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finance_outstanding_sums(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. 포인트 원장(전체 도메인) 조건 합계 — 종류별
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_point_ledger_sums(
  p_user_id uuid,
  p_sign text,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT l.*
      FROM public.point_ledger l
     WHERE (p_user_id IS NULL OR l.user_id = p_user_id)
       AND (p_from IS NULL OR l.created_at >= p_from)
       AND (p_to IS NULL OR l.created_at < p_to)
       AND (coalesce(p_sign, '') <> 'credit' OR l.amount > 0)
       AND (coalesce(p_sign, '') <> 'debit' OR l.amount < 0)
       -- 목록과 같이 캡처 감사 줄(0P 확정 기록)은 뺀다 = POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR 의 부정
       AND NOT (
         coalesce(l.entry_type = 'ad_purchase', false)
         AND coalesce(l.related_type IN ('feed_ad_request', 'promotion_order'), false)
         AND coalesce(l.related_id LIKE 'capture:%', false)
         AND coalesce(l.amount = 0, false)
       )
  ),
  kinded AS (
    -- 칸 분류 입력 = admin_point_ledger_domain_page(20271104140000) 의 kinded 와 같다
    SELECT lower(btrim(coalesce(f.entry_type, ''))) AS entry_type,
           coalesce(f.related_type, '') AS related_type,
           f.amount,
           (lower(btrim(coalesce(f.entry_type, ''))) = 'ad_hold' AND CASE f.related_type
              WHEN 'promotion_order' THEN EXISTS (
                SELECT 1 FROM public.promotion_point_holds h
                 WHERE h.promotion_order_id::text = regexp_replace(coalesce(f.related_id, ''), '^hold:', '')
                   AND lower(h.status) IN ('captured', 'charged'))
              WHEN 'feed_ad_request' THEN EXISTS (
                SELECT 1 FROM public.feed_ad_point_holds h
                 WHERE h.request_id::text = regexp_replace(coalesce(f.related_id, ''), '^hold:', '')
                   AND lower(h.status) IN ('captured', 'charged'))
              WHEN 'trade_post_ad' THEN EXISTS (
                SELECT 1 FROM public.trade_ad_point_holds h
                 WHERE h.trade_post_ad_id::text = regexp_replace(coalesce(f.related_id, ''), '^hold:', '')
                   AND lower(h.status) IN ('captured', 'charged'))
              ELSE false
            END) AS hold_captured
      FROM filtered f
  )
  SELECT jsonb_build_object(
    'count', (SELECT count(*) FROM filtered),
    'sums_by_kind', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'entry_type', g.entry_type,
               'related_type', g.related_type,
               'hold_captured', g.hold_captured,
               'amount_in', g.amount_in,
               'amount_out', g.amount_out,
               'count', g.n) ORDER BY g.entry_type, g.related_type, g.hold_captured)
        FROM (
          SELECT k.entry_type, k.related_type, k.hold_captured,
                 coalesce(sum(k.amount) FILTER (WHERE k.amount >= 0), 0) AS amount_in,
                 coalesce(sum(k.amount) FILTER (WHERE k.amount < 0), 0) AS amount_out,
                 count(*) AS n
            FROM kinded k
           GROUP BY k.entry_type, k.related_type, k.hold_captured
        ) g
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_point_ledger_sums(uuid, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_point_ledger_sums(uuid, text, timestamptz, timestamptz) TO service_role;

COMMIT;
