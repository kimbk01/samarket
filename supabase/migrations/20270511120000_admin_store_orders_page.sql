-- Admin store orders — server-paged read SSOT (`/admin/store-orders`).
-- Doc: docs/admin-store-orders-read-ssot.md
--
-- 1. store_commission_row_state(): the commission row-state rule, extracted from
--    store_commission_ledger_page (20270510120000) so the admin order list and the
--    settlement ledger share ONE definition. The ledger function is re-created below with
--    the identical body except the CASE → helper call (no behaviour change).
-- 2. admin_store_orders_page(): one read for list rows + total + tab counts.
--    Status groups / admin queue statuses are passed in from the TS contract
--    (lib/admin/store-orders/admin-store-orders-contract.ts) — not restated here.
--    Read-only: no order / payment / settlement writes.
-- 3. (created_at DESC, id DESC) index for the fixed list order.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Commission row state (shared)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.store_commission_row_state(
  p_adjustment_status text,
  p_fee_outstanding_minor bigint,
  p_status text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_adjustment_status = 'review_required' THEN 'review_required'
    WHEN p_fee_outstanding_minor > 0 THEN 'outstanding'
    WHEN p_adjustment_status = 'refunded' OR p_status = 'waived' THEN 'refunded'
    WHEN p_adjustment_status = 'kept' THEN 'kept'
    ELSE 'charged'
  END;
$$;

CREATE OR REPLACE FUNCTION public.store_commission_ledger_page(
  p_store_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_state text,
  p_order_no text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT ob.*, o.order_no, o.order_status, o.buyer_payment_method, s.store_name,
           a.id AS adj_id, a.decision AS adj_decision, a.approved_minor AS adj_approved,
           a.cash_refund_minor AS adj_cash, a.outstanding_cancel_minor AS adj_cancel,
           a.reason AS adj_reason, a.admin_user_id AS adj_admin, a.created_at AS adj_at,
           coalesce(ob.original_fee_due_minor, ob.fee_due_minor + coalesce(a.approved_minor, 0)) AS fee_charged,
           -- Debt first: a partially refunded or rejected row that still owes shows as outstanding.
           public.store_commission_row_state(ob.adjustment_status, ob.fee_outstanding_minor, ob.status) AS state
      FROM public.store_sale_fee_obligations ob
      JOIN public.store_orders o ON o.id = ob.order_id
      JOIN public.stores s ON s.id = ob.store_id
      LEFT JOIN public.store_commission_adjustments a ON a.obligation_id = ob.id
     WHERE (p_store_ids IS NULL OR ob.store_id = ANY (p_store_ids))
       AND (p_from IS NULL OR ob.created_at >= p_from)
       AND (p_to IS NULL OR ob.created_at < p_to)
       AND (nullif(btrim(coalesce(p_order_no, '')), '') IS NULL OR o.order_no ILIKE '%' || btrim(p_order_no) || '%')
  ),
  filtered AS (
    SELECT * FROM base
     WHERE p_state IS NULL OR p_state = 'all' OR state = p_state
        OR (p_state = 'decided' AND adj_id IS NOT NULL)
        -- decision-based views (a rejected row can still carry unpaid fee → state 'outstanding')
        OR (p_state = 'approved' AND adj_decision IN ('approve', 'legacy_auto'))
        OR (p_state = 'rejected' AND adj_decision = 'reject')
  ),
  sums AS (
    SELECT count(*) AS n,
           coalesce(sum(confirmed_revenue_php), 0) AS base_php,
           coalesce(sum(fee_charged), 0) AS charged,
           coalesce(sum(fee_paid_minor), 0) AS paid,
           coalesce(sum(fee_outstanding_minor), 0) AS outstanding,
           coalesce(sum(adj_cash), 0) AS refunded,
           coalesce(sum(adj_cancel), 0) AS cancelled,
           count(*) FILTER (WHERE state = 'review_required') AS review_n,
           coalesce(sum(fee_charged) FILTER (WHERE state = 'review_required'), 0) AS review_fee
      FROM filtered
  )
  SELECT jsonb_build_object(
    'total', (SELECT n FROM sums),
    'summary', (
      SELECT jsonb_build_object(
        'count', n,
        'commission_base_php', base_php,
        'fee_charged_minor', charged,
        'fee_paid_minor', paid,
        'fee_outstanding_minor', outstanding,
        'cash_refunded_minor', refunded,
        'outstanding_cancelled_minor', cancelled,
        'net_commission_minor', charged - refunded - cancelled,
        'review_count', review_n,
        'review_fee_minor', review_fee,
        'reconciles', charged = paid + outstanding + refunded + cancelled
      ) FROM sums
    ),
    'rows', coalesce((
      SELECT jsonb_agg(r ORDER BY r.created_at DESC, r.id) FROM (
        SELECT id, store_id, store_name, order_id, order_no, order_status, buyer_payment_method,
               charge_stage, created_at, confirmed_revenue_php, fee_snapshot, fee_charged,
               fee_paid_minor, fee_outstanding_minor, status, adjustment_status, adjustment_trigger,
               review_flagged_at, state, adj_id, adj_decision, adj_approved, adj_cash, adj_cancel,
               adj_reason, adj_admin, adj_at
          FROM filtered
         ORDER BY created_at DESC, id
         LIMIT LEAST(500, GREATEST(1, coalesce(p_limit, 100)))
        OFFSET GREATEST(0, coalesce(p_offset, 0))
      ) r
    ), '[]'::jsonb)
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Admin store orders page
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_store_orders_page(
  p_as_of timestamptz,
  p_from timestamptz,
  p_to timestamptz,
  p_tab_groups jsonb,
  p_tab text,
  p_order_status text,
  p_store_id uuid,
  p_store_name text,
  p_order_id uuid,
  p_order_no text,
  p_buyer_user_id uuid,
  p_buyer_q text,
  p_fulfillment_type text,
  p_payment_status text,
  p_queue_statuses text[],
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
           nullif(btrim(coalesce(p_store_name, '')), '') AS store_q,
           nullif(btrim(coalesce(p_order_no, '')), '') AS order_no_q,
           nullif(btrim(coalesce(p_buyer_q, '')), '') AS buyer_q,
           nullif(btrim(coalesce(p_order_status, '')), '') AS status_q,
           nullif(btrim(coalesce(p_fulfillment_type, '')), '') AS fulfillment_q,
           nullif(btrim(coalesce(p_payment_status, '')), '') AS payment_q,
           CASE
             WHEN p_tab IS NULL OR p_tab_groups IS NULL OR NOT (p_tab_groups ? p_tab) THEN NULL
             ELSE ARRAY(SELECT jsonb_array_elements_text(p_tab_groups -> p_tab))
           END AS tab_statuses,
           LEAST(200, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  -- Every filter except the tab / status → also the base of the tab counts.
  base AS (
    SELECT o.id, o.order_status, o.created_at
      FROM public.store_orders o
     CROSS JOIN params pr
     WHERE o.created_at <= pr.as_of
       AND (p_from IS NULL OR o.created_at >= p_from)
       AND (p_to IS NULL OR o.created_at < p_to)
       AND (p_store_id IS NULL OR o.store_id = p_store_id)
       AND (p_order_id IS NULL OR o.id = p_order_id)
       AND (p_buyer_user_id IS NULL OR o.buyer_user_id = p_buyer_user_id)
       AND (pr.order_no_q IS NULL OR o.order_no ILIKE '%' || pr.order_no_q || '%')
       AND (pr.store_q IS NULL OR o.store_id IN (
             SELECT s.id FROM public.stores s WHERE s.store_name ILIKE '%' || pr.store_q || '%'))
       AND (pr.buyer_q IS NULL OR o.buyer_user_id IN (
             SELECT p.id FROM public.profiles p
              WHERE p.nickname ILIKE '%' || pr.buyer_q || '%' OR p.username ILIKE '%' || pr.buyer_q || '%'
             UNION
             SELECT t.id FROM public.test_users t
              WHERE t.display_name ILIKE '%' || pr.buyer_q || '%' OR t.username ILIKE '%' || pr.buyer_q || '%'))
       AND (pr.fulfillment_q IS NULL OR o.fulfillment_type = pr.fulfillment_q)
       AND (pr.payment_q IS NULL OR o.payment_status = pr.payment_q)
       -- Admin Action Queue deep link (`orders_attention`): same predicate as the Bell COUNT.
       AND (p_queue_statuses IS NULL
            OR o.order_status = ANY (p_queue_statuses)
            OR (coalesce(o.needs_admin_attention, false)
                AND NOT (o.order_status = ANY (coalesce(p_queue_closed_statuses, '{}'::text[])))))
  ),
  filtered AS (
    SELECT b.*
      FROM base b
     CROSS JOIN params pr
     WHERE (pr.tab_statuses IS NULL OR b.order_status = ANY (pr.tab_statuses))
       AND (pr.status_q IS NULL OR b.order_status = pr.status_q)
  ),
  page AS (
    SELECT f.id, f.created_at
      FROM filtered f
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'as_of', (SELECT as_of FROM params),
    'total', (SELECT count(*) FROM filtered),
    'tab_counts', (
      SELECT coalesce(jsonb_object_agg(g.key, (
               SELECT count(*) FROM base b
                WHERE b.order_status IN (SELECT jsonb_array_elements_text(g.value)))), '{}'::jsonb)
             || jsonb_build_object('all', (SELECT count(*) FROM base))
        FROM jsonb_each(coalesce(p_tab_groups, '{}'::jsonb)) g
    ),
    'rows', coalesce((
      SELECT jsonb_agg(r ORDER BY r.created_at DESC, r.id DESC) FROM (
        SELECT o.id, o.order_no, o.store_id, s.store_name,
               o.buyer_user_id,
               public.admin_store_orders_buyer_label(
                 t.display_name, coalesce(p.nickname, t.username), coalesce(p.username, t.username), o.buyer_user_id
               ) AS buyer_label,
               o.fulfillment_type, o.order_status, o.payment_status, o.buyer_payment_method,
               o.total_amount, o.payment_amount, o.discount_amount, o.gift_redemption_amount,
               o.created_at, o.sla_warning_level, o.sla_warning_reason,
               o.admin_locked, o.dispute_status,
               d.delivery_status,
               it.first_title, it.line_count, it.qty_total,
               ev.completed_at,
               ob.id AS commission_obligation_id,
               CASE WHEN ob.id IS NULL THEN NULL
                    ELSE public.store_commission_row_state(ob.adjustment_status, ob.fee_outstanding_minor, ob.status)
               END AS commission_state
          FROM page pg
          JOIN public.store_orders o ON o.id = pg.id
          LEFT JOIN public.stores s ON s.id = o.store_id
          LEFT JOIN public.profiles p ON p.id = o.buyer_user_id
          LEFT JOIN public.test_users t ON t.id = o.buyer_user_id
          LEFT JOIN public.store_order_deliveries d ON d.order_id = o.id
          LEFT JOIN public.store_sale_fee_obligations ob ON ob.order_id = o.id
          LEFT JOIN LATERAL (
            SELECT (array_agg(i.product_title_snapshot ORDER BY i.id))[1] AS first_title,
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
      ) r
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_store_orders_page(timestamptz, timestamptz, timestamptz, jsonb, text, text, uuid, text, uuid, text, uuid, text, text, text, text[], text[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_orders_page(timestamptz, timestamptz, timestamptz, jsonb, text, text, uuid, text, uuid, text, uuid, text, text, text, text[], text[], integer, integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Fixed list order index
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_store_orders_created_id_desc
  ON public.store_orders (created_at DESC, id DESC);
