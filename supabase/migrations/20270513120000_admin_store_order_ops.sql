-- Admin order operations (관리자 주문 운영 v3) — read-only functions for the independent screens
-- 주문 목록 · 주문 액션 · 취소 요청 · 환불 요청. Design: docs/admin-store-order-ops-ssot.md
--
-- New functions only. `admin_store_orders_page` (20270511120000) is left untouched.
-- No order / payment / settlement writes. service_role only.
--
-- Shared rules (same as the TS contract lib/admin/store-orders/admin-store-order-detail-contract.ts):
-- * gift certificate amount: gift_certificate_redemptions (ledger) when present, else the order column
-- * money mismatch: ledger gift missing on the order, gift not deducted, gift reversed while the order is
--   open, or order amount − coupon − gift ≠ customer paid
-- * representative item: largest subtotal (ties → title); item ids are random uuids, not an order
-- * period basis per screen: created | cancel_requested | cancelled | refund_requested | refunded

-- ═══════════════════════════════════════════════════════════════════════════
-- Per-order derived facts (basis times, gift ledger, request info) — one place for both functions.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_store_order_ops_facts(p_order_ids uuid[])
RETURNS TABLE (
  order_id uuid,
  gift_ledger bigint,
  gift_reversed boolean,
  gift_amount bigint,
  money_mismatch boolean,
  cancel_requested_at timestamptz,
  cancelled_at timestamptz,
  refund_requested_at timestamptz,
  refunded_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id,
         coalesce(g.redeemed, 0)::bigint,
         coalesce(g.reversed, false),
         (CASE WHEN coalesce(g.redeemed, 0) > 0 THEN g.redeemed ELSE coalesce(o.gift_redemption_amount, 0) END)::bigint,
         (
           (coalesce(g.redeemed, 0) > 0 AND coalesce(o.gift_redemption_amount, 0) = 0)
           OR ((CASE WHEN coalesce(g.redeemed, 0) > 0 THEN g.redeemed ELSE coalesce(o.gift_redemption_amount, 0) END) > 0
               AND o.total_amount - coalesce(o.discount_amount, 0) = o.payment_amount)
           OR (coalesce(g.reversed, false) AND o.order_status NOT IN ('completed', 'cancelled', 'refunded'))
           OR (o.total_amount - coalesce(o.discount_amount, 0)
               - (CASE WHEN coalesce(g.redeemed, 0) > 0 THEN g.redeemed ELSE coalesce(o.gift_redemption_amount, 0) END)
               <> o.payment_amount)
         ),
         cr.requested_at,
         ev.cancelled_at,
         ev.refund_requested_at,
         coalesce(o.refunded_at, ev.refunded_event_at)
    FROM public.store_orders o
    LEFT JOIN LATERAL (
      SELECT sum(r.redeemed_amount) AS redeemed, bool_or(r.reversed) AS reversed
        FROM public.gift_certificate_redemptions r
       WHERE r.order_id = o.id
    ) g ON true
    LEFT JOIN LATERAL (
      SELECT max(c.created_at) AS requested_at
        FROM public.store_order_cancel_requests c
       WHERE c.order_id = o.id
    ) cr ON true
    LEFT JOIN LATERAL (
      SELECT max(e.created_at) FILTER (WHERE e.to_status = 'cancelled') AS cancelled_at,
             max(e.created_at) FILTER (WHERE e.to_status = 'refund_requested') AS refund_requested_at,
             max(e.created_at) FILTER (WHERE e.to_status = 'refunded') AS refunded_event_at
        FROM public.store_order_events e
       WHERE e.order_id = o.id
    ) ev ON true
   WHERE o.id = ANY (p_order_ids);
$$;

REVOKE ALL ON FUNCTION public.admin_store_order_ops_facts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_order_ops_facts(uuid[]) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Page: rows + total + tab counts under one WHERE (per-screen scope / basis / tabs from TS).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_store_order_ops_page(
  p_as_of timestamptz,
  p_from timestamptz,
  p_to timestamptz,
  p_basis text,
  p_scope_statuses text[],
  p_tab_groups jsonb,
  p_tab text,
  p_order_status text,
  p_store_id uuid,
  p_order_id uuid,
  p_buyer_user_id uuid,
  p_q text,
  p_fulfillment_type text,
  p_payment_status text,
  p_payment_method text,
  p_mismatch_only boolean,
  p_queue_closed_statuses text[],
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
    SELECT coalesce(p_as_of, now()) AS as_of,
           coalesce(nullif(btrim(coalesce(p_basis, '')), ''), 'created') AS basis,
           nullif(btrim(coalesce(p_q, '')), '') AS q,
           nullif(btrim(coalesce(p_order_status, '')), '') AS status_q,
           nullif(btrim(coalesce(p_fulfillment_type, '')), '') AS fulfillment_q,
           nullif(btrim(coalesce(p_payment_status, '')), '') AS payment_q,
           nullif(btrim(coalesce(p_payment_method, '')), '') AS method_q,
           CASE
             WHEN p_tab IS NULL OR p_tab_groups IS NULL OR NOT (p_tab_groups ? p_tab) THEN NULL
             ELSE ARRAY(SELECT jsonb_array_elements_text(p_tab_groups -> p_tab))
           END AS tab_statuses,
           LEAST(200, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  scoped AS (
    SELECT o.id, o.order_status, o.created_at, o.store_id, o.buyer_user_id, o.order_no,
           o.fulfillment_type, o.payment_status, o.buyer_payment_method
      FROM public.store_orders o
     CROSS JOIN params pr
     WHERE o.created_at <= pr.as_of
       AND (p_scope_statuses IS NULL OR o.order_status = ANY (p_scope_statuses))
       -- 주문 액션 (운영 예외): same predicate as the Bell `orders_attention` COUNT.
       AND (p_queue_closed_statuses IS NULL
            OR (coalesce(o.needs_admin_attention, false) AND NOT (o.order_status = ANY (p_queue_closed_statuses))))
       AND (p_store_id IS NULL OR o.store_id = p_store_id)
       AND (p_order_id IS NULL OR o.id = p_order_id)
       AND (p_buyer_user_id IS NULL OR o.buyer_user_id = p_buyer_user_id)
       AND (pr.fulfillment_q IS NULL OR o.fulfillment_type = pr.fulfillment_q)
       AND (pr.payment_q IS NULL OR o.payment_status = pr.payment_q)
       AND (pr.method_q IS NULL
            OR (pr.method_q = 'none' AND nullif(btrim(coalesce(o.buyer_payment_method, '')), '') IS NULL)
            OR o.buyer_payment_method = pr.method_q)
       -- 통합 검색: 주문번호 · 매장명 · 구매자
       AND (pr.q IS NULL
            OR o.order_no ILIKE '%' || pr.q || '%'
            OR o.store_id IN (SELECT s.id FROM public.stores s WHERE s.store_name ILIKE '%' || pr.q || '%')
            OR o.buyer_user_id IN (
                 SELECT p.id FROM public.profiles p
                  WHERE p.nickname ILIKE '%' || pr.q || '%' OR p.username ILIKE '%' || pr.q || '%'
                 UNION
                 SELECT t.id FROM public.test_users t
                  WHERE t.display_name ILIKE '%' || pr.q || '%' OR t.username ILIKE '%' || pr.q || '%'))
  ),
  facts AS (
    SELECT f.* FROM public.admin_store_order_ops_facts(ARRAY(SELECT id FROM scoped)) f
  ),
  base AS (
    SELECT sc.*,
           CASE pr.basis
             WHEN 'cancel_requested' THEN coalesce(fa.cancel_requested_at, sc.created_at)
             WHEN 'cancelled' THEN coalesce(fa.cancelled_at, sc.created_at)
             WHEN 'refund_requested' THEN coalesce(fa.refund_requested_at, sc.created_at)
             WHEN 'refunded' THEN coalesce(fa.refunded_at, sc.created_at)
             ELSE sc.created_at
           END AS basis_at,
           fa.money_mismatch
      FROM scoped sc
      JOIN facts fa ON fa.order_id = sc.id
     CROSS JOIN params pr
     WHERE (NOT coalesce(p_mismatch_only, false) OR fa.money_mismatch)
  ),
  ranged AS (
    SELECT b.* FROM base b
     WHERE (p_from IS NULL OR b.basis_at >= p_from)
       AND (p_to IS NULL OR b.basis_at < p_to)
  ),
  filtered AS (
    SELECT r.* FROM ranged r
     CROSS JOIN params pr
     WHERE (pr.tab_statuses IS NULL OR r.order_status = ANY (pr.tab_statuses))
       AND (pr.status_q IS NULL OR r.order_status = pr.status_q)
  ),
  page AS (
    SELECT f.id, f.basis_at, f.created_at
      FROM filtered f
     ORDER BY f.basis_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'as_of', (SELECT as_of FROM params),
    'total', (SELECT count(*) FROM filtered),
    'tab_counts', (
      SELECT coalesce(jsonb_object_agg(g.key, (
               SELECT count(*) FROM ranged r
                WHERE r.order_status IN (SELECT jsonb_array_elements_text(g.value)))), '{}'::jsonb)
             || jsonb_build_object('all', (SELECT count(*) FROM ranged))
        FROM jsonb_each(coalesce(p_tab_groups, '{}'::jsonb)) g
    ),
    'rows', coalesce((
      SELECT jsonb_agg(r ORDER BY r.basis_at DESC, r.id DESC) FROM (
        SELECT o.id, o.order_no, o.store_id, s.store_name,
               o.buyer_user_id,
               public.admin_store_orders_buyer_label(
                 t.display_name, coalesce(p.nickname, t.username), coalesce(p.username, t.username), o.buyer_user_id
               ) AS buyer_label,
               o.fulfillment_type, o.order_status, o.payment_status, o.buyer_payment_method,
               o.total_amount, o.payment_amount, o.discount_amount,
               fa.gift_amount, fa.gift_reversed, fa.money_mismatch,
               o.created_at, pg.basis_at, o.sla_warning_level, o.sla_warning_reason,
               o.admin_locked, o.dispute_status, o.needs_admin_attention,
               d.delivery_status, d.rider_failure_reported_at,
               it.first_title, it.line_count, it.qty_total,
               ev.completed_at,
               fa.cancel_requested_at, fa.cancelled_at, fa.refund_requested_at, fa.refunded_at,
               cr.requested_role AS cancel_requested_role, cr.reason AS cancel_reason, cr.status AS cancel_request_status,
               cr.decided_at AS cancel_decided_at, cr.rejected_reason AS cancel_rejected_reason,
               rr.actor_role AS refund_requested_role, rr.message AS refund_reason,
               dec.actor_role AS decided_role,
               ob.id AS commission_obligation_id,
               CASE WHEN ob.id IS NULL THEN NULL
                    ELSE public.store_commission_row_state(ob.adjustment_status, ob.fee_outstanding_minor, ob.status)
               END AS commission_state
          FROM page pg
          JOIN public.store_orders o ON o.id = pg.id
          JOIN facts fa ON fa.order_id = o.id
          LEFT JOIN public.stores s ON s.id = o.store_id
          LEFT JOIN public.profiles p ON p.id = o.buyer_user_id
          LEFT JOIN public.test_users t ON t.id = o.buyer_user_id
          LEFT JOIN public.store_order_deliveries d ON d.order_id = o.id
          LEFT JOIN public.store_sale_fee_obligations ob ON ob.order_id = o.id
          LEFT JOIN LATERAL (
            SELECT (array_agg(i.product_title_snapshot ORDER BY i.subtotal DESC, i.product_title_snapshot))[1] AS first_title,
                   count(*) AS line_count,
                   coalesce(sum(i.qty), 0) AS qty_total
              FROM public.store_order_items i
             WHERE i.order_id = o.id
          ) it ON true
          LEFT JOIN LATERAL (
            SELECT max(e.created_at) AS completed_at
              FROM public.store_order_events e
             WHERE e.order_id = o.id AND e.event_type = 'order_completed'
          ) ev ON true
          LEFT JOIN LATERAL (
            SELECT c.requested_role, c.reason, c.status,
                   coalesce(c.approved_at, c.rejected_at) AS decided_at, c.rejected_reason
              FROM public.store_order_cancel_requests c
             WHERE c.order_id = o.id
             ORDER BY c.created_at DESC
             LIMIT 1
          ) cr ON true
          LEFT JOIN LATERAL (
            SELECT e.actor_role, e.message
              FROM public.store_order_events e
             WHERE e.order_id = o.id AND e.to_status = 'refund_requested'
             ORDER BY e.created_at DESC
             LIMIT 1
          ) rr ON true
          LEFT JOIN LATERAL (
            -- Who closed the request (order moved out of cancel_requested / refund_requested).
            SELECT e.actor_role
              FROM public.store_order_events e
             WHERE e.order_id = o.id AND e.from_status IN ('cancel_requested', 'refund_requested')
             ORDER BY e.created_at DESC
             LIMIT 1
          ) dec ON true
      ) r
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_store_order_ops_page(timestamptz, timestamptz, timestamptz, text, text[], jsonb, text, text, uuid, uuid, uuid, text, text, text, text, boolean, text[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_order_ops_page(timestamptz, timestamptz, timestamptz, text, text[], jsonb, text, text, uuid, uuid, uuid, text, text, text, text, boolean, text[], integer, integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Summary (주문 목록 현황 · 취소/환불 요약). Each block states its own time basis.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_store_order_ops_summary(
  p_scope text,
  p_from timestamptz,
  p_to timestamptz,
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope_orders AS (
    SELECT o.*
      FROM public.store_orders o
     WHERE (p_store_id IS NULL OR o.store_id = p_store_id)
       AND (CASE p_scope
              WHEN 'cancel' THEN o.order_status IN ('cancel_requested', 'cancelled')
              WHEN 'refund' THEN o.order_status IN ('refund_requested', 'refunded')
              ELSE true
            END)
  ),
  f AS (
    SELECT so.*, fa.gift_amount, fa.gift_reversed, fa.money_mismatch,
           fa.cancel_requested_at, fa.cancelled_at, fa.refund_requested_at, fa.refunded_at AS refunded_basis_at
      FROM scope_orders so
      JOIN public.admin_store_order_ops_facts(ARRAY(SELECT id FROM scope_orders)) fa ON fa.order_id = so.id
  ),
  in_created AS (
    SELECT * FROM f WHERE (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at < p_to)
  ),
  fee AS (
    SELECT count(*) AS n,
           coalesce(sum(ob.confirmed_revenue_php), 0) AS base_php,
           coalesce(sum(coalesce(ob.original_fee_due_minor, ob.fee_due_minor + coalesce(a.approved_minor, 0))), 0) AS fee_minor,
           count(*) FILTER (WHERE ob.adjustment_status = 'review_required') AS review_n
      FROM in_created ic
      JOIN public.store_sale_fee_obligations ob ON ob.order_id = ic.id
      LEFT JOIN public.store_commission_adjustments a ON a.obligation_id = ob.id
  )
  SELECT CASE coalesce(p_scope, 'orders')
    WHEN 'cancel' THEN jsonb_build_object(
      'scope', 'cancel',
      'pending', (SELECT jsonb_build_object('basis', 'cancel_requested', 'count', count(*), 'paid', coalesce(sum(payment_amount), 0),
                                            'oldest_at', min(coalesce(cancel_requested_at, created_at)))
                    FROM f WHERE order_status = 'cancel_requested'
                     AND (p_from IS NULL OR coalesce(cancel_requested_at, created_at) >= p_from)
                     AND (p_to IS NULL OR coalesce(cancel_requested_at, created_at) < p_to)),
      'done', (SELECT jsonb_build_object('basis', 'cancelled', 'count', count(*), 'paid', coalesce(sum(payment_amount), 0))
                 FROM f WHERE order_status = 'cancelled'
                  AND (p_from IS NULL OR coalesce(cancelled_at, created_at) >= p_from)
                  AND (p_to IS NULL OR coalesce(cancelled_at, created_at) < p_to)))
    WHEN 'refund' THEN jsonb_build_object(
      'scope', 'refund',
      'pending', (SELECT jsonb_build_object('basis', 'refund_requested', 'count', count(*), 'paid', coalesce(sum(payment_amount), 0),
                                            'oldest_at', min(coalesce(refund_requested_at, created_at)))
                    FROM f WHERE order_status = 'refund_requested'
                     AND (p_from IS NULL OR coalesce(refund_requested_at, created_at) >= p_from)
                     AND (p_to IS NULL OR coalesce(refund_requested_at, created_at) < p_to)),
      'done', (SELECT jsonb_build_object('basis', 'refunded', 'count', count(*), 'paid', coalesce(sum(payment_amount), 0),
                                         'gift_reversed', count(*) FILTER (WHERE gift_reversed))
                 FROM f WHERE order_status = 'refunded'
                  AND (p_from IS NULL OR coalesce(refunded_basis_at, created_at) >= p_from)
                  AND (p_to IS NULL OR coalesce(refunded_basis_at, created_at) < p_to)),
      'commission_review', (SELECT count(*) FROM f JOIN public.store_sale_fee_obligations ob ON ob.order_id = f.id
                             WHERE ob.adjustment_status = 'review_required'))
    ELSE jsonb_build_object(
      'scope', 'orders',
      'basis', 'created',
      'all', (SELECT jsonb_build_object('count', count(*), 'order_amount', coalesce(sum(total_amount), 0), 'paid', coalesce(sum(payment_amount), 0)) FROM in_created),
      'in_progress', (SELECT jsonb_build_object('count', count(*), 'order_amount', coalesce(sum(total_amount), 0))
                        FROM in_created WHERE order_status IN ('pending', 'accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived')),
      'completed', (SELECT jsonb_build_object('count', count(*), 'order_amount', coalesce(sum(total_amount), 0), 'paid', coalesce(sum(payment_amount), 0))
                      FROM in_created WHERE order_status = 'completed'),
      'cancelled', (SELECT jsonb_build_object('count', count(*), 'paid', coalesce(sum(payment_amount), 0)) FROM in_created WHERE order_status = 'cancelled'),
      'cancel_requested', (SELECT jsonb_build_object('count', count(*), 'paid', coalesce(sum(payment_amount), 0)) FROM in_created WHERE order_status = 'cancel_requested'),
      'refund_requested', (SELECT jsonb_build_object('count', count(*), 'paid', coalesce(sum(payment_amount), 0)) FROM in_created WHERE order_status = 'refund_requested'),
      'refunded', (SELECT jsonb_build_object('count', count(*), 'paid', coalesce(sum(payment_amount), 0)) FROM in_created WHERE order_status = 'refunded'),
      'commission', (SELECT jsonb_build_object('count', n, 'base_php', base_php, 'fee_minor', fee_minor, 'review_count', review_n) FROM fee),
      'mismatch', (SELECT count(*) FROM in_created WHERE money_mismatch))
  END;
$$;

REVOKE ALL ON FUNCTION public.admin_store_order_ops_summary(text, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_order_ops_summary(text, timestamptz, timestamptz, uuid) TO service_role;
