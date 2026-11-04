-- 재감사 4단계 (Owner 「4단계 진행」 2026-11-04) — 기간 합계를 서버 메모리 전량 읽기 대신 SQL 집계로 (P-1 · P-9) + 보류 대조 uuid 비교 (P-6).
-- 설계: docs/audit/currency-remaining-defects-design-2026-11-04.md §4. 데이터 변경 없음. 모두 SECURITY DEFINER · service_role 만.
--
-- P-1 owner_wallet_period_summary(store, wallet coin|cash, from, to)
--   사장님 Coin·Cash 내역 합계 — 이전: 요청마다 기간 원장을 1,000줄씩 최대 5만 줄 읽어 TS 에서 합산.
--   돌려주는 값 = 종류(·방향)별 건수·합 + 시작·종료 잔액을 잔액 사슬로 고를 경계 묶음 4개(각 = 같은 시각 줄 전부)
--   + (coin) 기간 안 지급 완료 출금 합. 분류·잔액 사슬 판정은 TS(lib/finance/wallet-period-history.ts) 그대로.
-- P-9 member_gift_wallet_period_sums(user, from, to) · member_promotion_order_period_sums(user, from, to)
--     owner_gift_redemption_page(store, from, to, filter, limit, offset)
--   1단계 C-4·C-5·C-6 의 기간 합계(상한 5천·2만 줄 전량 읽기) → SQL 집계. 상품권 정산은 목록 거르기·쪽도 SQL(확정 = 수익 원장
--   REVENUE_AVAILABLE·RECOGNITION_CORRECTION·REVERSED 순합 > 0 — lib/gift-certificate/gift-revenue-recognition.ts 와 같은 규칙).
-- P-6 admin_point_ledger_domain_page · admin_point_ledger_sums — 보류 대조를 uuid 열 = uuid 값으로(인덱스 사용). 출력은 같다.
-- 롤백: P-6 두 함수 = 20271104140000 · 20271104150000 본문 재적용 · 나머지 = DROP FUNCTION (아래 서명).

BEGIN;

-- ═══ P-1 ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.owner_wallet_period_summary(
  p_store_id uuid,
  p_wallet text,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coin boolean := lower(coalesce(p_wallet, '')) = 'coin';
  v_out jsonb;
BEGIN
  -- 공통 모양: id · created_at · entry_kind · direction(cash) · signed(부호 있는 금액) · balance_after
  WITH l AS (
    SELECT s.id, s.created_at, s.entry_kind, NULL::text AS direction,
           s.amount::bigint AS signed, s.balance_after::bigint AS balance_after
      FROM public.store_economic_point_ledger s
     WHERE v_coin AND s.store_id = p_store_id
    UNION ALL
    SELECT b.id, b.created_at, b.entry_kind, lower(b.direction),
           CASE WHEN lower(b.direction) = 'credit' THEN abs(b.amount_minor) ELSE -abs(b.amount_minor) END::bigint,
           b.balance_after_minor::bigint
      FROM public.business_cash_ledger b
     WHERE NOT v_coin AND b.store_id = p_store_id
  ),
  per AS (
    SELECT * FROM l
     WHERE (p_from IS NULL OR l.created_at >= p_from)
       AND (p_to IS NULL OR l.created_at < p_to)
  ),
  t AS (
    SELECT (SELECT max(created_at) FROM per) AS close1,
           (SELECT max(created_at) FROM l WHERE p_from IS NOT NULL AND l.created_at < p_from) AS open1
  ),
  t2 AS (
    SELECT t.close1, t.open1,
           (SELECT max(created_at) FROM l WHERE l.created_at < t.close1) AS close2,
           (SELECT max(created_at) FROM l WHERE l.created_at < t.open1) AS open2
      FROM t
  ),
  grp AS (
    SELECT jsonb_agg(jsonb_build_object('id', l.id, 'created_at', l.created_at, 'signed', l.signed,
                                        'balance_after', l.balance_after) ORDER BY l.id DESC) FILTER (WHERE l.created_at = t2.close1) AS close1,
           jsonb_agg(jsonb_build_object('id', l.id, 'created_at', l.created_at, 'signed', l.signed,
                                        'balance_after', l.balance_after) ORDER BY l.id DESC) FILTER (WHERE l.created_at = t2.close2) AS close2,
           jsonb_agg(jsonb_build_object('id', l.id, 'created_at', l.created_at, 'signed', l.signed,
                                        'balance_after', l.balance_after) ORDER BY l.id DESC) FILTER (WHERE l.created_at = t2.open1) AS open1,
           jsonb_agg(jsonb_build_object('id', l.id, 'created_at', l.created_at, 'signed', l.signed,
                                        'balance_after', l.balance_after) ORDER BY l.id DESC) FILTER (WHERE l.created_at = t2.open2) AS open2
      FROM l CROSS JOIN t2
     WHERE l.created_at IN (t2.close1, t2.close2, t2.open1, t2.open2)
  )
  SELECT jsonb_build_object(
    'wallet', CASE WHEN v_coin THEN 'coin' ELSE 'cash' END,
    'row_count', (SELECT count(*) FROM per),
    'sums_by_kind', coalesce((
      SELECT jsonb_agg(jsonb_build_object('entry_kind', g.entry_kind, 'direction', g.direction,
                                          'count', g.n, 'signed', g.signed, 'abs', g.abs_amt)
                       ORDER BY g.entry_kind, g.direction)
        FROM (SELECT coalesce(per.entry_kind, '') AS entry_kind, per.direction, count(*) AS n,
                     coalesce(sum(per.signed), 0) AS signed, coalesce(sum(abs(per.signed)), 0) AS abs_amt
                FROM per GROUP BY coalesce(per.entry_kind, ''), per.direction) g
    ), '[]'::jsonb),
    'close_group', coalesce((SELECT close1 FROM grp), '[]'::jsonb),
    'close_prev_group', coalesce((SELECT close2 FROM grp), '[]'::jsonb),
    'open_group', coalesce((SELECT open1 FROM grp), '[]'::jsonb),
    'open_prev_group', coalesce((SELECT open2 FROM grp), '[]'::jsonb),
    -- Coin: 기간 안에 지급 완료된 출금 합(지급 시각 기준) — 잔액 변화가 아니라 지급 사실(R3-d)
    'withdrawal_paid', CASE WHEN v_coin THEN (
      SELECT coalesce(sum(w.amount), 0) FROM public.coin_withdrawal_requests w
       WHERE w.store_id = p_store_id AND upper(w.status) = 'PAID'
         AND (p_from IS NULL OR w.paid_at >= p_from)
         AND (p_to IS NULL OR w.paid_at < p_to)
    ) END
  ) INTO v_out;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_wallet_period_summary(uuid, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_wallet_period_summary(uuid, text, timestamptz, timestamptz) TO service_role;

-- ═══ P-9 회원 상품권 지갑 기간 합계 ═════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.member_gift_wallet_period_sums(p_user_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- 규칙 = lib/gift-certificate/gift-wallet-history.ts summarizeGiftWalletPeriod (음수·빈 값 = 0)
  SELECT jsonb_build_object(
    'purchased', (SELECT jsonb_build_object('count', count(*), 'amount', coalesce(sum(greatest(0, coalesce(i.purchase_price, 0))), 0))
                    FROM public.gift_certificate_instances i
                   WHERE i.purchaser_user_id = p_user_id
                     AND (p_from IS NULL OR i.purchased_at >= p_from) AND (p_to IS NULL OR i.purchased_at < p_to)),
    'used', (SELECT jsonb_build_object('count', count(*), 'amount', coalesce(sum(greatest(0, coalesce(r.redeemed_amount, 0))), 0),
                                       'forfeited', coalesce(sum(greatest(0, coalesce(r.forfeited_amount, 0))), 0))
               FROM public.gift_certificate_redemptions r
              WHERE r.buyer_user_id = p_user_id AND r.reversed = false
                AND (p_from IS NULL OR r.created_at >= p_from) AND (p_to IS NULL OR r.created_at < p_to)),
    'received', (SELECT jsonb_build_object('count', count(*), 'amount', coalesce(sum(greatest(0, coalesce(i.face_value, 0))), 0))
                   FROM public.gift_certificate_transfers t
                   LEFT JOIN public.gift_certificate_instances i ON i.id = t.instance_id
                  WHERE t.recipient_user_id = p_user_id AND t.status = 'ACCEPTED'
                    AND (p_from IS NULL OR t.created_at >= p_from) AND (p_to IS NULL OR t.created_at < p_to)),
    'sent', (SELECT jsonb_build_object('count', count(*), 'amount', coalesce(sum(greatest(0, coalesce(i.face_value, 0))), 0))
               FROM public.gift_certificate_transfers t
               LEFT JOIN public.gift_certificate_instances i ON i.id = t.instance_id
              WHERE t.sender_user_id = p_user_id AND t.status = 'ACCEPTED'
                AND (p_from IS NULL OR t.created_at >= p_from) AND (p_to IS NULL OR t.created_at < p_to))
  );
$$;

REVOKE ALL ON FUNCTION public.member_gift_wallet_period_sums(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_gift_wallet_period_sums(uuid, timestamptz, timestamptz) TO service_role;

-- ═══ P-9 회원 상위노출 신청 기간 합계 ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.member_promotion_order_period_sums(p_user_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- 규칙 = lib/points/promotion-order-history.ts summarizePromotionOrders (상태 = 소문자·공백 제거, 빈 값 unknown · 음수 = 0)
  SELECT coalesce(jsonb_agg(jsonb_build_object('status', g.status, 'count', g.n, 'point_cost', g.cost, 'refund_points', g.refund)
                            ORDER BY g.status), '[]'::jsonb)
    FROM (
      SELECT coalesce(nullif(lower(btrim(coalesce(o.order_status, ''))), ''), 'unknown') AS status,
             count(*) AS n,
             coalesce(sum(greatest(0, coalesce(o.point_cost, 0))), 0) AS cost,
             coalesce(sum(greatest(0, coalesce(o.refund_points, 0))), 0) AS refund
        FROM public.point_promotion_orders o
       WHERE o.user_id = p_user_id
         AND (p_from IS NULL OR o.created_at >= p_from) AND (p_to IS NULL OR o.created_at < p_to)
       GROUP BY 1
    ) g;
$$;

REVOKE ALL ON FUNCTION public.member_promotion_order_period_sums(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_promotion_order_period_sums(uuid, timestamptz, timestamptz) TO service_role;

-- ═══ P-9 사장님 상품권 정산 — 합계 + 거르기 + 쪽 ═══════════════════════════
CREATE OR REPLACE FUNCTION public.owner_gift_redemption_page(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_filter text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT x.id, x.order_id, x.instance_id, x.redeemed_amount, x.platform_fee_amount, x.merchant_net_amount,
           x.platform_fee_rate_snapshot, coalesce(x.reversed, false) AS reversed, x.created_at, x.reversed_at,
           coalesce((SELECT sum(e.amount) FROM public.gift_certificate_revenue_ledger e
                      WHERE e.redemption_id = x.id
                        AND e.entry_type IN ('REVENUE_AVAILABLE', 'RECOGNITION_CORRECTION', 'REVERSED')), 0) > 0 AS recognized
      FROM public.gift_certificate_redemptions x
     WHERE x.store_id = p_store_id
       AND (p_from IS NULL OR x.created_at >= p_from) AND (p_to IS NULL OR x.created_at < p_to)
  ),
  f AS (
    SELECT * FROM r
     WHERE CASE lower(coalesce(p_filter, 'all'))
             WHEN 'refund' THEN r.reversed
             WHEN 'recognized' THEN NOT r.reversed AND r.recognized
             WHEN 'pending' THEN NOT r.reversed AND NOT r.recognized
             ELSE true
           END
  )
  SELECT jsonb_build_object(
    -- 합계 = 기간 전체(거르기와 무관) · 상태 칸(환불 / 확정 / 대기)별 건수·금액(음수 = 0)
    'groups', coalesce((
      SELECT jsonb_agg(jsonb_build_object('reversed', g.reversed, 'recognized', g.recognized, 'count', g.n,
                                          'redeemed', g.gross, 'fee', g.fee, 'net', g.net))
        FROM (SELECT r.reversed, r.recognized, count(*) AS n,
                     coalesce(sum(greatest(0, coalesce(r.redeemed_amount, 0))), 0) AS gross,
                     coalesce(sum(greatest(0, coalesce(r.platform_fee_amount, 0))), 0) AS fee,
                     coalesce(sum(greatest(0, coalesce(r.merchant_net_amount, 0))), 0) AS net
                FROM r GROUP BY r.reversed, r.recognized) g
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM f),
    'rows', coalesce((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.id DESC)
        FROM (SELECT * FROM f ORDER BY f.created_at DESC, f.id DESC
               LIMIT greatest(least(coalesce(p_limit, 20), 100), 0) OFFSET greatest(coalesce(p_offset, 0), 0)) p
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.owner_gift_redemption_page(uuid, timestamptz, timestamptz, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_gift_redemption_page(uuid, timestamptz, timestamptz, text, integer, integer) TO service_role;

-- ═══ P-6 ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_point_ledger_domain_page(
  p_domain text,
  p_related_types text[],
  p_user_id uuid,
  p_entry_type text,
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
  WITH params AS (
    SELECT ARRAY(SELECT t FROM unnest(coalesce(p_related_types, ARRAY[]::text[])) t WHERE t <> 'promotion_order') AS plain,
           ('promotion_order' = ANY (coalesce(p_related_types, ARRAY[]::text[]))) AS with_promo,
           nullif(btrim(coalesce(p_entry_type, '')), '') AS entry_type,
           LEAST(100, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  promo_orders AS (
    SELECT o.id FROM public.point_promotion_orders o
     CROSS JOIN params pr
     WHERE pr.with_promo AND o.domain = p_domain
  ),
  promo_related AS (
    SELECT po.id::text AS rid FROM promo_orders po
    UNION ALL SELECT 'hold:' || po.id::text FROM promo_orders po
    UNION ALL SELECT 'capture:' || po.id::text FROM promo_orders po
    UNION ALL
    SELECT 'release:' || h.id::text FROM public.promotion_point_holds h
     WHERE h.promotion_order_id IN (SELECT po.id FROM promo_orders po)
  ),
  filtered AS (
    SELECT l.*
      FROM public.point_ledger l
     CROSS JOIN params pr
     WHERE (l.related_type = ANY (pr.plain)
            OR (pr.with_promo AND l.related_type = 'promotion_order'
                AND l.related_id IN (SELECT rid FROM promo_related)))
       AND (p_user_id IS NULL OR l.user_id = p_user_id)
       AND (pr.entry_type IS NULL OR l.entry_type = pr.entry_type)
       AND (p_from IS NULL OR l.created_at >= p_from)
       AND (p_to IS NULL OR l.created_at < p_to)
  ),
  page AS (
    SELECT f.* FROM filtered f
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  ),
  kinded AS (
    SELECT lower(btrim(coalesce(f.entry_type, ''))) AS entry_type,
           coalesce(f.related_type, '') AS related_type,
           f.amount,
           (lower(btrim(coalesce(f.entry_type, ''))) = 'ad_hold' AND CASE f.related_type
              WHEN 'promotion_order' THEN EXISTS (
                SELECT 1 FROM public.promotion_point_holds h
                 WHERE h.promotion_order_id = f.hold_ref_uuid
                   AND lower(h.status) IN ('captured', 'charged'))
              WHEN 'feed_ad_request' THEN EXISTS (
                SELECT 1 FROM public.feed_ad_point_holds h
                 WHERE h.request_id = f.hold_ref_uuid
                   AND lower(h.status) IN ('captured', 'charged'))
              WHEN 'trade_post_ad' THEN EXISTS (
                SELECT 1 FROM public.trade_ad_point_holds h
                 WHERE h.trade_post_ad_id = f.hold_ref_uuid
                   AND lower(h.status) IN ('captured', 'charged'))
              ELSE false
            END) AS hold_captured
      FROM (
        -- P-6: 보류 줄의 대상 id 를 uuid 로 한 번만 바꿔 보류 표의 uuid 열과 바로 비교(인덱스 사용 · 이전: uuid 열을 문자로 바꿔 비교)
        SELECT f0.*,
               CASE WHEN regexp_replace(coalesce(f0.related_id, ''), '^hold:', '')
                         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN regexp_replace(coalesce(f0.related_id, ''), '^hold:', '')::uuid
               END AS hold_ref_uuid
          FROM filtered f0
      ) f
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'sums', (
      SELECT jsonb_build_object(
               'count', count(*),
               'amount_in', coalesce(sum(f.amount) FILTER (WHERE f.amount >= 0), 0),
               'amount_out', coalesce(sum(f.amount) FILTER (WHERE f.amount < 0), 0))
        FROM filtered f
    ),
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
    ), '[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.id DESC) FROM page p), '[]'::jsonb)
  );
$$;

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
                 WHERE h.promotion_order_id = f.hold_ref_uuid
                   AND lower(h.status) IN ('captured', 'charged'))
              WHEN 'feed_ad_request' THEN EXISTS (
                SELECT 1 FROM public.feed_ad_point_holds h
                 WHERE h.request_id = f.hold_ref_uuid
                   AND lower(h.status) IN ('captured', 'charged'))
              WHEN 'trade_post_ad' THEN EXISTS (
                SELECT 1 FROM public.trade_ad_point_holds h
                 WHERE h.trade_post_ad_id = f.hold_ref_uuid
                   AND lower(h.status) IN ('captured', 'charged'))
              ELSE false
            END) AS hold_captured
      FROM (
        -- P-6: 보류 줄의 대상 id 를 uuid 로 한 번만 바꿔 보류 표의 uuid 열과 바로 비교(인덱스 사용 · 이전: uuid 열을 문자로 바꿔 비교)
        SELECT f0.*,
               CASE WHEN regexp_replace(coalesce(f0.related_id, ''), '^hold:', '')
                         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN regexp_replace(coalesce(f0.related_id, ''), '^hold:', '')::uuid
               END AS hold_ref_uuid
          FROM filtered f0
      ) f
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
REVOKE ALL ON FUNCTION public.admin_point_ledger_domain_page(text, text[], uuid, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_point_ledger_domain_page(text, text[], uuid, text, timestamptz, timestamptz, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.admin_point_ledger_sums(uuid, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_point_ledger_sums(uuid, text, timestamptz, timestamptz) TO service_role;

COMMIT;
