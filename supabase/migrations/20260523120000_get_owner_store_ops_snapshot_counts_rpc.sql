-- Owner dashboard GET …/order-counts — store_orders·products·inquiries·reviews 단일 RTT 집계 (legacy multi-count 폴백).
-- CONTRACT: 필드명·의미는 lib/stores/owner-store-ops-snapshot.ts 와 동일.

CREATE OR REPLACE FUNCTION public.get_owner_store_ops_snapshot_counts(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH day_bounds AS (
    SELECT
      date_trunc('day', now()) AS today_start,
      date_trunc('day', now()) - interval '1 day' AS yesterday_start,
      date_trunc('day', now()) - interval '3 minutes' AS pending_3m_cutoff
  ),
  orders AS (
    SELECT
      o.order_status,
      o.fulfillment_type,
      o.sla_warning_reason,
      o.dispute_status,
      o.payment_amount,
      o.created_at,
      o.updated_at,
      o.estimated_ready_at
    FROM public.store_orders AS o
    WHERE o.store_id = p_store_id
  ),
  order_agg AS (
    SELECT
      coalesce(sum(CASE WHEN order_status = 'refund_requested' THEN 1 ELSE 0 END), 0)::int AS refund_requested_count,
      coalesce(sum(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END), 0)::int AS pending_accept_count,
      coalesce(
        sum(
          CASE
            WHEN order_status = 'pending' AND fulfillment_type = 'local_delivery' THEN 1
            ELSE 0
          END
        ),
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
      coalesce(
        sum(CASE WHEN order_status IN ('accepted', 'preparing') THEN 1 ELSE 0 END),
        0
      )::int AS flow_cooking_count,
      coalesce(
        sum(
          CASE WHEN order_status IN ('ready_for_pickup', 'delivering', 'arrived') THEN 1 ELSE 0 END
        ),
        0
      )::int AS flow_delivering_count,
      coalesce(
        sum(
          CASE
            WHEN order_status = 'completed' AND updated_at >= (SELECT today_start FROM day_bounds) THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS flow_completed_today_count,
      coalesce(
        sum(CASE WHEN created_at >= (SELECT today_start FROM day_bounds) THEN 1 ELSE 0 END),
        0
      )::int AS today_order_count,
      coalesce(
        sum(
          CASE
            WHEN order_status = 'cancelled' AND created_at >= (SELECT today_start FROM day_bounds) THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS today_cancelled_count,
      coalesce(
        sum(
          CASE
            WHEN order_status = 'completed' AND updated_at >= (SELECT today_start FROM day_bounds) THEN payment_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS today_completed_sales_amount,
      coalesce(
        sum(
          CASE
            WHEN order_status = 'completed'
              AND updated_at >= (SELECT yesterday_start FROM day_bounds)
              AND updated_at < (SELECT today_start FROM day_bounds)
              THEN payment_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS yesterday_completed_sales_amount,
      coalesce(
        sum(
          CASE
            WHEN dispute_status IS NOT NULL AND dispute_status <> '' THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS active_dispute_count,
      coalesce(
        sum(
          CASE
            WHEN order_status = 'preparing'
              AND (
                sla_warning_reason = 'eta_overdue'
                OR (
                  estimated_ready_at IS NOT NULL
                  AND estimated_ready_at < now()
                )
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
        sum(
          CASE
            WHEN order_status = 'preparing' AND sla_warning_reason = 'eta_overdue' THEN 1
            ELSE 0
          END
        ),
        0
      )::int AS flow_cooking_delayed_sla,
      coalesce(
        sum(
          CASE
            WHEN order_status = 'preparing'
              AND estimated_ready_at IS NOT NULL
              AND estimated_ready_at < now()
              THEN 1
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
    'today_cancelled_count', o.today_cancelled_count,
    'reviews_need_reply_count', r.reviews_need_reply_count,
    'active_dispute_count', o.active_dispute_count,
    'hidden_product_count', p.hidden_product_count,
    'sale_suspended_product_count', p.sale_suspended_product_count
  )
  FROM order_agg AS o, product_agg AS p, inquiry_agg AS i, review_agg AS r;
$$;

COMMENT ON FUNCTION public.get_owner_store_ops_snapshot_counts(uuid) IS
  'Owner store order-counts snapshot — one SQL for KPI counts; store_ops meta remains separate TS query.';

REVOKE ALL ON FUNCTION public.get_owner_store_ops_snapshot_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_owner_store_ops_snapshot_counts(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_owner_store_ops_snapshot_counts(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_store_ops_snapshot_counts(uuid) TO service_role;
