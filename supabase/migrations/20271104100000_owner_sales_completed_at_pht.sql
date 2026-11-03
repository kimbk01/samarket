-- 사장님 매출·정산 날짜 기준 정립 1단계 (Owner 「1단계부터 진행」 2026-11-03)
-- 설계: docs/audit/owner-e2e-round2-review-and-dashboard-design-2026-11-03.md §6-4 · §2 N3
--
-- ① store_orders.completed_at — 매출이 잡히는 날 = 완료된 시각 (updated_at 대체 종료)
-- ② get_owner_store_ops_snapshot_counts — 하루 경계 PHT 00:00 · 완료 매출 completed_at · 「3분 이상 미접수」 = now() - 3분
-- ③ store_sales_period_summary — 매출 화면·홈 공용 기간 집계 (일/월 · PHT · 누적 없음)
-- ④ store_platform_payable_page — 기간 기준 주문 생성 → 완료 시각 (Admin·Owner 같은 함수)
-- ⑤ stores.updated_at — 시스템 투영 열만 바뀐 UPDATE 는 updated_at 유지 (사장님 저장 CAS 409 오탐 N3)

-- ─────────────────────────────────────────────────────────────
-- ① completed_at
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.store_orders.completed_at IS
  '주문이 처음 completed 로 바뀐 시각(UTC 저장). 매출·지급 기간의 기준. 트리거 store_orders_set_completed_at 만 채운다.';

CREATE OR REPLACE FUNCTION public.store_orders_set_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF NEW.order_status = 'completed'
     AND NEW.completed_at IS NULL
     AND (TG_OP = 'INSERT' OR OLD.order_status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_orders_set_completed_at ON public.store_orders;
CREATE TRIGGER trg_store_orders_set_completed_at
  BEFORE INSERT OR UPDATE OF order_status ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.store_orders_set_completed_at();

-- 백필: 완료 이벤트 시각(관리자 화면과 같은 방식) → 없으면 현재 completed 행만 updated_at.
-- 주문 updated_at 이 백필로 바뀌지 않게 updated_at 트리거를 이 문장 동안만 끈다(같은 트랜잭션).
ALTER TABLE public.store_orders DISABLE TRIGGER store_orders_updated_at;

UPDATE public.store_orders AS o
   SET completed_at = coalesce(ev.completed_ev_at, CASE WHEN o.order_status = 'completed' THEN o.updated_at END)
  FROM (
    SELECT o2.id,
           (SELECT max(e.created_at)
              FROM public.store_order_events AS e
             WHERE e.order_id = o2.id AND e.to_status = 'completed') AS completed_ev_at
      FROM public.store_orders AS o2
     WHERE o2.completed_at IS NULL
  ) AS ev
 WHERE ev.id = o.id
   AND o.completed_at IS NULL
   AND (ev.completed_ev_at IS NOT NULL OR o.order_status = 'completed');

ALTER TABLE public.store_orders ENABLE TRIGGER store_orders_updated_at;

CREATE INDEX IF NOT EXISTS store_orders_store_completed_at_idx
  ON public.store_orders (store_id, completed_at)
  WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS store_orders_store_refunded_at_idx
  ON public.store_orders (store_id, refunded_at)
  WHERE refunded_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- ② 홈 스냅샷 — PHT 하루 경계 · completed_at · 3분 기준
--    반환 키는 기존 그대로 + yesterday_same_time_sales_amount 추가.
--    today_completed_sales_amount = 오늘 완료 매출 − 오늘 환불(완료됐던 주문)
--    today_cancelled_count = 오늘 들어온 주문 중 취소·환불 (취소율 분자)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_owner_store_ops_snapshot_counts(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH day_bounds AS (
    SELECT
      (date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila') AS today_start,
      (date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila') - interval '1 day' AS yesterday_start,
      now() - interval '1 day' AS yesterday_same_time,
      now() - interval '3 minutes' AS pending_3m_cutoff
  ),
  orders AS (
    SELECT
      o.order_status,
      o.fulfillment_type,
      o.sla_warning_reason,
      o.dispute_status,
      greatest(
        0,
        coalesce(o.payment_amount, 0)
          + coalesce(o.gift_redemption_amount, 0)
          + coalesce(o.platform_funded_amount, 0)
      )::numeric AS sale_amount,
      o.created_at,
      o.completed_at,
      o.refunded_at,
      o.estimated_ready_at
    FROM public.store_orders AS o
    WHERE o.store_id = p_store_id
  ),
  order_agg AS (
    SELECT
      coalesce(sum(CASE WHEN order_status = 'refund_requested' THEN 1 ELSE 0 END), 0)::int AS refund_requested_count,
      coalesce(sum(CASE WHEN order_status = 'cancel_requested' THEN 1 ELSE 0 END), 0)::int AS cancel_requested_count,
      coalesce(sum(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END), 0)::int AS pending_accept_count,
      coalesce(
        sum(CASE WHEN order_status = 'pending' AND fulfillment_type = 'local_delivery' THEN 1 ELSE 0 END),
        0
      )::int AS pending_delivery_count,
      coalesce(
        sum(
          CASE
            WHEN order_status IN ('accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived') THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS in_progress_count,
      coalesce(
        sum(
          CASE
            WHEN order_status = 'pending' AND created_at < (SELECT pending_3m_cutoff FROM day_bounds) THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS pending_over_3m_count,
      coalesce(sum(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END), 0)::int AS flow_waiting_count,
      coalesce(sum(CASE WHEN order_status IN ('accepted', 'preparing') THEN 1 ELSE 0 END), 0)::int AS flow_cooking_count,
      coalesce(
        sum(CASE WHEN order_status IN ('ready_for_pickup', 'delivering', 'arrived') THEN 1 ELSE 0 END),
        0
      )::int AS flow_delivering_count,
      coalesce(
        sum(CASE WHEN completed_at >= (SELECT today_start FROM day_bounds) THEN 1 ELSE 0 END),
        0
      )::int AS flow_completed_today_count,
      coalesce(
        sum(CASE WHEN created_at >= (SELECT today_start FROM day_bounds) THEN 1 ELSE 0 END),
        0
      )::int AS today_order_count,
      coalesce(
        sum(
          CASE
            WHEN order_status IN ('cancelled', 'refunded') AND created_at >= (SELECT today_start FROM day_bounds) THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS today_cancelled_count,
      coalesce(
        sum(CASE WHEN completed_at >= (SELECT today_start FROM day_bounds) THEN sale_amount ELSE 0 END),
        0
      )::numeric
        - coalesce(
          sum(
            CASE
              WHEN order_status = 'refunded'
                AND completed_at IS NOT NULL
                AND refunded_at >= (SELECT today_start FROM day_bounds)
                THEN sale_amount
              ELSE 0
            END
          ),
          0
        )::numeric AS today_completed_sales_amount,
      coalesce(
        sum(
          CASE
            WHEN completed_at >= (SELECT yesterday_start FROM day_bounds)
              AND completed_at < (SELECT today_start FROM day_bounds)
              THEN sale_amount
            ELSE 0
          END
        ),
        0
      )::numeric
        - coalesce(
          sum(
            CASE
              WHEN order_status = 'refunded'
                AND completed_at IS NOT NULL
                AND refunded_at >= (SELECT yesterday_start FROM day_bounds)
                AND refunded_at < (SELECT today_start FROM day_bounds)
                THEN sale_amount
              ELSE 0
            END
          ),
          0
        )::numeric AS yesterday_completed_sales_amount,
      coalesce(
        sum(
          CASE
            WHEN completed_at >= (SELECT yesterday_start FROM day_bounds)
              AND completed_at < (SELECT yesterday_same_time FROM day_bounds)
              THEN sale_amount
            ELSE 0
          END
        ),
        0
      )::numeric
        - coalesce(
          sum(
            CASE
              WHEN order_status = 'refunded'
                AND completed_at IS NOT NULL
                AND refunded_at >= (SELECT yesterday_start FROM day_bounds)
                AND refunded_at < (SELECT yesterday_same_time FROM day_bounds)
                THEN sale_amount
              ELSE 0
            END
          ),
          0
        )::numeric AS yesterday_same_time_sales_amount,
      coalesce(
        sum(CASE WHEN dispute_status IS NOT NULL AND dispute_status <> '' THEN 1 ELSE 0 END),
        0
      )::int AS active_dispute_count,
      coalesce(
        sum(
          CASE
            WHEN order_status = 'preparing'
              AND (
                sla_warning_reason = 'eta_overdue'
                OR (estimated_ready_at IS NOT NULL AND estimated_ready_at < now())
              )
              THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS cooking_delay_count,
      coalesce(
        sum(
          CASE
            WHEN order_status IN ('ready_for_pickup', 'delivering', 'arrived')
              AND sla_warning_reason IN ('delivery_over_60m', 'unassigned_over_10m')
              THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS delivery_delay_count,
      coalesce(
        sum(CASE WHEN order_status = 'preparing' AND sla_warning_reason = 'eta_overdue' THEN 1 ELSE 0 END),
        0
      )::int AS flow_cooking_delayed_sla,
      coalesce(
        sum(
          CASE
            WHEN order_status = 'preparing' AND estimated_ready_at IS NOT NULL AND estimated_ready_at < now() THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS flow_cooking_delayed_eta,
      coalesce(
        sum(
          CASE
            WHEN order_status IN ('ready_for_pickup', 'delivering', 'arrived')
              AND sla_warning_reason IN ('delivery_over_60m', 'unassigned_over_10m')
              THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS flow_delivering_delayed_count,
      coalesce(
        sum(
          CASE
            WHEN order_status IN ('ready_for_pickup', 'delivering', 'arrived')
              AND sla_warning_reason = 'unassigned_over_10m'
              THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS rider_unassigned_sla
    FROM orders
  ),
  product_agg AS (
    SELECT
      coalesce(sum(CASE WHEN product_status = 'sold_out' THEN 1 ELSE 0 END), 0)::int AS sold_out_product_count,
      coalesce(sum(CASE WHEN product_status = 'hidden' THEN 1 ELSE 0 END), 0)::int AS hidden_product_count,
      coalesce(sum(CASE WHEN product_status = 'draft' THEN 1 ELSE 0 END), 0)::int AS sale_suspended_product_count
    FROM public.store_products
    WHERE store_id = p_store_id
  ),
  inquiry_agg AS (
    SELECT coalesce(count(*)::int, 0) AS open_inquiries_count
    FROM public.store_inquiries
    WHERE store_id = p_store_id AND status = 'open'
  ),
  review_agg AS (
    SELECT coalesce(count(*)::int, 0) AS reviews_need_reply_count
    FROM public.store_reviews
    WHERE store_id = p_store_id AND owner_reply_content IS NULL
  )
  SELECT jsonb_build_object(
    'refund_requested_count', o.refund_requested_count,
    'cancel_requested_count', o.cancel_requested_count,
    'pending_accept_count', o.pending_accept_count,
    'pending_delivery_count', o.pending_delivery_count,
    'in_progress_count', o.in_progress_count,
    'today_completed_sales_amount', round(o.today_completed_sales_amount)::int,
    'open_inquiries_count', i.open_inquiries_count,
    'sold_out_product_count', p.sold_out_product_count,
    'pending_over_3m_count', o.pending_over_3m_count,
    'cooking_delay_count', greatest(o.cooking_delay_count, o.flow_cooking_delayed_sla, o.flow_cooking_delayed_eta),
    'delivery_delay_count', o.delivery_delay_count,
    'rider_unassigned_count', o.rider_unassigned_sla,
    'flow_waiting_count', o.flow_waiting_count,
    'flow_cooking_count', o.flow_cooking_count,
    'flow_delivering_count', o.flow_delivering_count,
    'flow_completed_today_count', o.flow_completed_today_count,
    'flow_cooking_delayed_count', greatest(o.flow_cooking_delayed_sla, o.flow_cooking_delayed_eta),
    'flow_delivering_delayed_count', o.flow_delivering_delayed_count,
    'today_order_count', o.today_order_count,
    'yesterday_completed_sales_amount', round(o.yesterday_completed_sales_amount)::int,
    'yesterday_same_time_sales_amount', round(o.yesterday_same_time_sales_amount)::int,
    'today_cancelled_count', o.today_cancelled_count,
    'reviews_need_reply_count', r.reviews_need_reply_count,
    'active_dispute_count', o.active_dispute_count,
    'hidden_product_count', p.hidden_product_count,
    'sale_suspended_product_count', p.sale_suspended_product_count
  )
  FROM order_agg AS o, product_agg AS p, inquiry_agg AS i, review_agg AS r;
$function$;

-- ─────────────────────────────────────────────────────────────
-- ③ 기간 매출 집계 (일 / 월 · PHT · 최대 400일 · 누적(전체) 없음)
--    들어온 주문 = created_at · 완료 매출 = completed_at · 환불 차감 = refunded_at(완료됐던 주문만)
--    취소 = 그 기간에 들어온 주문 중 cancelled·refunded
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.store_sales_period_summary(
  p_store_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_grain text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fmt text := CASE coalesce(p_grain, 'day') WHEN 'month' THEN 'YYYY-MM' ELSE 'YYYY-MM-DD' END;
  v_result jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RAISE EXCEPTION 'store_sales_period_required' USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > interval '400 days' THEN
    RAISE EXCEPTION 'store_sales_period_too_long' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_grain, 'day') NOT IN ('day', 'month') THEN
    RAISE EXCEPTION 'store_sales_grain_invalid' USING ERRCODE = '22023';
  END IF;

  WITH scoped AS (
    SELECT
      o.order_status,
      greatest(
        0,
        coalesce(o.payment_amount, 0)
          + coalesce(o.gift_redemption_amount, 0)
          + coalesce(o.platform_funded_amount, 0)
      )::numeric AS sale_amount,
      o.created_at,
      o.completed_at,
      o.refunded_at
    FROM public.store_orders AS o
    WHERE (p_store_ids IS NULL OR o.store_id = ANY (p_store_ids))
      AND (
        (o.created_at >= p_from AND o.created_at < p_to)
        OR (o.completed_at >= p_from AND o.completed_at < p_to)
        OR (o.refunded_at >= p_from AND o.refunded_at < p_to)
      )
  ),
  events AS (
    SELECT to_char(created_at AT TIME ZONE 'Asia/Manila', v_fmt) AS bucket,
           1 AS created_n,
           CASE WHEN order_status IN ('cancelled', 'refunded') THEN 1 ELSE 0 END AS cancelled_n,
           0 AS completed_n, 0::numeric AS gross_php, 0 AS refunded_n, 0::numeric AS refunded_php
      FROM scoped WHERE created_at >= p_from AND created_at < p_to
    UNION ALL
    SELECT to_char(completed_at AT TIME ZONE 'Asia/Manila', v_fmt), 0, 0, 1, sale_amount, 0, 0
      FROM scoped WHERE completed_at >= p_from AND completed_at < p_to
    UNION ALL
    SELECT to_char(refunded_at AT TIME ZONE 'Asia/Manila', v_fmt), 0, 0, 0, 0, 1, sale_amount
      FROM scoped
     WHERE order_status = 'refunded' AND completed_at IS NOT NULL
       AND refunded_at >= p_from AND refunded_at < p_to
  ),
  buckets AS (
    SELECT bucket,
           sum(created_n)::int AS created_count,
           sum(cancelled_n)::int AS cancelled_count,
           sum(completed_n)::int AS completed_count,
           round(sum(gross_php))::bigint AS gross_sales_php,
           sum(refunded_n)::int AS refunded_count,
           round(sum(refunded_php))::bigint AS refunded_php,
           round(sum(gross_php) - sum(refunded_php))::bigint AS net_sales_php
      FROM events
     GROUP BY bucket
  )
  SELECT jsonb_build_object(
    'grain', coalesce(p_grain, 'day'),
    'time_zone', 'Asia/Manila',
    'totals', (
      SELECT jsonb_build_object(
        'created_count', coalesce(sum(created_count), 0),
        'cancelled_count', coalesce(sum(cancelled_count), 0),
        'completed_count', coalesce(sum(completed_count), 0),
        'gross_sales_php', coalesce(sum(gross_sales_php), 0),
        'refunded_count', coalesce(sum(refunded_count), 0),
        'refunded_php', coalesce(sum(refunded_php), 0),
        'net_sales_php', coalesce(sum(net_sales_php), 0),
        'avg_order_value_php', CASE WHEN coalesce(sum(completed_count), 0) > 0
                                    THEN round(sum(gross_sales_php)::numeric / sum(completed_count))::bigint
                                    ELSE 0 END
      ) FROM buckets
    ),
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'bucket', bucket,
          'created_count', created_count,
          'cancelled_count', cancelled_count,
          'completed_count', completed_count,
          'gross_sales_php', gross_sales_php,
          'refunded_count', refunded_count,
          'refunded_php', refunded_php,
          'net_sales_php', net_sales_php,
          'avg_order_value_php', CASE WHEN completed_count > 0
                                      THEN round(gross_sales_php::numeric / completed_count)::bigint
                                      ELSE 0 END
        )
        ORDER BY bucket DESC
      ) FROM buckets
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.store_sales_period_summary(uuid[], timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_sales_period_summary(uuid[], timestamptz, timestamptz, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_sales_period_summary(uuid[], timestamptz, timestamptz, text) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- ④ 지급 의무 페이지 — 기간 기준 = 완료 시각 (본문은 기존과 같고 기간 필터·정렬·행 completed_at 만 변경)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.store_platform_payable_page(p_store_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_view text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT o.id AS order_id, o.order_no, o.store_id, s.store_name, o.created_at, o.completed_at, o.buyer_payment_method,
           GREATEST(0, trunc(coalesce(o.payment_amount, 0)))::bigint AS direct_php,
           (GREATEST(0, trunc(coalesce(o.gift_redemption_amount, 0)))
            + GREATEST(0, trunc(coalesce(o.platform_funded_amount, 0))))::bigint AS held_php,
           -- Stage 2-B (D-2 option A): only the platform-funded coupon is paid as Coin.
           GREATEST(0, trunc(coalesce(o.platform_funded_amount, 0)))::bigint AS coin_due_php,
           coalesce((SELECT e.amount FROM public.store_economic_point_ledger e
                      WHERE e.idempotency_key = 'sale_coin:' || o.id::text), 0)::bigint AS coin_minted,
           -- sale_coin minted before the stage-2 cutoff (gift gross was minted then) - preserved as is (D-5).
           coalesce((SELECT e.created_at < '2026-10-20 20:30:00+00'::timestamptz FROM public.store_economic_point_ledger e
                      WHERE e.idempotency_key = 'sale_coin:' || o.id::text), false) AS legacy_preserved,
           -- Gift redemptions with a live gift_certificate_redemptions row are owed on the gift
           -- revenue rail (gift_certificate_revenue_ledger -> admin gift payout), never as Coin.
           LEAST(GREATEST(0, trunc(coalesce(o.gift_redemption_amount, 0)))::bigint,
                 coalesce((SELECT sum(r.redeemed_amount) FROM public.gift_certificate_redemptions r
                            WHERE r.order_id = o.id AND NOT coalesce(r.reversed, false)), 0)::bigint) AS gift_rail_php,
           coalesce((SELECT sum(r.merchant_net_amount) FROM public.gift_certificate_redemptions r
                      WHERE r.order_id = o.id AND NOT coalesce(r.reversed, false)), 0)::bigint AS gift_rail_net_php,
           coalesce((SELECT sum(r.platform_fee_amount) FROM public.gift_certificate_redemptions r
                      WHERE r.order_id = o.id AND NOT coalesce(r.reversed, false)), 0)::bigint AS gift_fee_php,
           st.settlement_status, coalesce(st.net_settlement_amount, st.settlement_amount, 0)::bigint AS legacy_net_php
      FROM public.store_orders o
      JOIN public.stores s ON s.id = o.store_id
      LEFT JOIN public.store_settlements st ON st.order_id = o.id
     WHERE o.order_status = 'completed'
       AND (p_store_ids IS NULL OR o.store_id = ANY (p_store_ids))
       -- 기간 = 완료 시각 (이 마이그레이션 전: 주문 생성 시각). completed_at 은 백필로 모든 completed 행에 있음.
       AND (p_from IS NULL OR o.completed_at >= p_from)
       AND (p_to IS NULL OR o.completed_at < p_to)
  ),
  resid AS (
    SELECT *, held_php - gift_rail_php AS rail_free_held_php FROM base
  ),
  cls AS (
    SELECT *,
           LEAST(coin_due_php, coin_minted) AS held_paid_by_coin_php,
           coin_due_php - LEAST(coin_due_php, coin_minted) AS payable_php,
           gift_rail_net_php + coin_due_php AS platform_owes_php,
           -- Coin above what the Coin rail owes (platform coupon). Legacy mints keep the pre-stage-2 rule.
           CASE WHEN legacy_preserved THEN GREATEST(0, coin_minted - rail_free_held_php)
                ELSE GREATEST(0, coin_minted - coin_due_php)
           END AS coin_over_credit,
           CASE
             WHEN coin_due_php - LEAST(coin_due_php, coin_minted) > 0 THEN 'payable'
             WHEN gift_rail_php > 0 THEN 'gift_rail'
             WHEN settlement_status = 'paid' THEN 'legacy_manual_paid'
             ELSE 'direct_collected'
           END AS class
      FROM resid
  ),
  filtered AS (
    -- payable: what the Coin rail owes (+ legacy manual payouts to review); exceptions: financial
    -- anomalies (Coin above the Coin rail, legacy manual payouts); all: every completed order.
    SELECT * FROM cls
     WHERE CASE coalesce(p_view, 'payable')
             WHEN 'all' THEN true
             WHEN 'exceptions' THEN coin_over_credit > 0 OR class = 'legacy_manual_paid'
             ELSE class IN ('payable', 'legacy_manual_paid')
           END
  )
  SELECT jsonb_build_object(
    'summary', (SELECT jsonb_build_object(
        'orders', count(*),
        'direct_collected_php', coalesce(sum(direct_php), 0),
        'platform_held_php', coalesce(sum(held_php), 0),
        'held_paid_by_coin_php', coalesce(sum(held_paid_by_coin_php), 0),
        'coin_due_php', coalesce(sum(coin_due_php), 0),
        'gift_rail_php', coalesce(sum(gift_rail_php), 0),
        'gift_rail_net_php', coalesce(sum(gift_rail_net_php), 0),
        'gift_fee_php', coalesce(sum(gift_fee_php), 0),
        'gift_rail_orders', count(*) FILTER (WHERE gift_rail_php > 0),
        'platform_owes_php', coalesce(sum(platform_owes_php), 0),
        'payable_php', coalesce(sum(payable_php), 0),
        'payable_orders', count(*) FILTER (WHERE payable_php > 0),
        'coin_over_credit', coalesce(sum(coin_over_credit), 0),
        'legacy_preserved_orders', count(*) FILTER (WHERE legacy_preserved),
        'legacy_open_settlement_php', coalesce(sum(legacy_net_php) FILTER (WHERE settlement_status IN ('scheduled', 'processing', 'held')), 0),
        'legacy_open_settlement_count', count(*) FILTER (WHERE settlement_status IN ('scheduled', 'processing', 'held')),
        'legacy_manual_paid_php', coalesce(sum(legacy_net_php) FILTER (WHERE settlement_status = 'paid'), 0),
        'legacy_manual_paid_count', count(*) FILTER (WHERE settlement_status = 'paid')
      ) FROM cls),
    -- Gift rail position now (not date-filtered): available to pay out and already paid out.
    'gift_rail', jsonb_build_object(
        'available_php', coalesce((SELECT sum(public.gift_certificate_store_revenue_available(x.store_id))
                                     FROM (SELECT DISTINCT l.store_id FROM public.gift_certificate_revenue_ledger l
                                            WHERE p_store_ids IS NULL OR l.store_id = ANY (p_store_ids)) x), 0),
        'paid_out_php', coalesce((SELECT sum(p.amount) FROM public.gift_certificate_store_payouts p
                                   WHERE p_store_ids IS NULL OR p.store_id = ANY (p_store_ids)), 0)
      ),
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(r ORDER BY r.completed_at DESC, r.order_id) FROM (
        SELECT order_id, order_no, store_id, store_name, created_at, completed_at, buyer_payment_method, direct_php, held_php,
               coin_minted, coin_due_php, gift_rail_php, gift_rail_net_php, gift_fee_php, platform_owes_php,
               held_paid_by_coin_php, payable_php, coin_over_credit, legacy_preserved,
               settlement_status, legacy_net_php, class
          FROM filtered
         ORDER BY completed_at DESC, order_id
         LIMIT LEAST(500, GREATEST(1, coalesce(p_limit, 100)))
        OFFSET GREATEST(0, coalesce(p_offset, 0))
      ) r
    ), '[]'::jsonb)
  );
$function$;

-- ─────────────────────────────────────────────────────────────
-- ⑤ stores.updated_at — 시스템 투영 열만 바뀌면 유지
--    시스템 열(사장님·관리자가 화면에서 쓰지 않는 열 · 쓰는 곳):
--      delivery_policy_version           invalidate-discovery-store-projections.ts
--      discovery_schedule_state,
--      next_schedule_transition_at       persist-discovery-schedule-projection.ts (저장 후 백그라운드·정기 작업)
--      completed_orders_30d(_at)         apply/expire_store_order_popularity_ledger*, store-order-popularity-projection.ts
--      point_balance                     adjust/approve/charge/credit/spend_store_points*
--      point_commerce_blocked,
--      point_block_reason,
--      point_warning_at                  evaluate_store_point_commerce_block
--      rating_avg, review_count          refresh_store_public_rating_aggregate
--    그 밖의 열이 하나라도 바뀌면 지금처럼 now().
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stores_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_system_cols text[] := ARRAY[
    'updated_at',
    'delivery_policy_version',
    'discovery_schedule_state',
    'next_schedule_transition_at',
    'completed_orders_30d',
    'completed_orders_30d_at',
    'point_balance',
    'point_commerce_blocked',
    'point_block_reason',
    'point_warning_at',
    'rating_avg',
    'review_count'
  ];
BEGIN
  IF (to_jsonb(NEW) - v_system_cols) = (to_jsonb(OLD) - v_system_cols) THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_updated_at ON public.stores;
CREATE TRIGGER stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.stores_set_updated_at();
