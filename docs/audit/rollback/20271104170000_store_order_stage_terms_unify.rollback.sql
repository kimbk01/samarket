-- 롤백: 20271104170000_store_order_stage_terms_unify.sql
-- 목록 함수 = 20271104110000 본문 · 손님 상세·홈 숫자 = 2026-11-04 운영 조회본(cancel_kind·4단계 칸 이전)
-- 주의: 웹을 먼저 되돌린 뒤 실행한다 (웹 조회가 cancel_kind 칸을 읽는다)

CREATE OR REPLACE FUNCTION public.get_owner_store_orders_list_snapshot(
  p_store_id uuid,
  p_owner_user_id uuid,
  p_status text DEFAULT ''::text,
  p_limit integer DEFAULT 60,
  p_cursor text DEFAULT ''::text,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_date_basis text DEFAULT 'created'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_ok boolean := false;
  v_limit integer := greatest(1, least(120, coalesce(p_limit, 60)));
  v_status text := coalesce(trim(p_status), '');
  v_cursor text := coalesce(trim(p_cursor), '');
  v_cursor_created timestamptz;
  v_cursor_id uuid;
  v_dash jsonb;
  v_reviews_exist boolean := false;
  v_has_range boolean := p_from IS NOT NULL AND p_to IS NOT NULL AND p_to > p_from;
  v_completed_basis boolean := coalesce(p_date_basis, 'created') = 'completed';
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.owner_user_id = p_owner_user_id
  ) INTO v_store_ok;

  IF NOT v_store_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden', 'updated_at', now());
  END IF;

  SELECT to_regclass('public.store_reviews') IS NOT NULL INTO v_reviews_exist;

  IF v_cursor <> '' THEN
    BEGIN
      v_cursor_created := split_part(v_cursor, '|', 1)::timestamptz;
      v_cursor_id := split_part(v_cursor, '|', 2)::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_cursor_created := NULL;
      v_cursor_id := NULL;
    END;
  END IF;

  v_dash := public.get_owner_store_ops_dashboard_snapshot(p_store_id, p_owner_user_id);

  RETURN (
    WITH store_addr AS (
      SELECT region, city, district, address_line1, address_line2
      FROM public.stores
      WHERE id = p_store_id
      LIMIT 1
    ),
    order_rows AS (
      SELECT o.*
      FROM public.store_orders o
      WHERE o.store_id = p_store_id
        AND (v_status = '' OR o.order_status = v_status)
        AND (
          NOT v_has_range
          OR (
            NOT v_completed_basis
            AND o.created_at >= p_from AND o.created_at < p_to
          )
          OR (
            v_completed_basis
            AND o.completed_at >= p_from AND o.completed_at < p_to
          )
        )
        AND (
          v_cursor_created IS NULL
          OR o.created_at < v_cursor_created
          OR (o.created_at = v_cursor_created AND o.id < v_cursor_id)
        )
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT v_limit + 1
    ),
    win_rows AS (
      SELECT * FROM order_rows LIMIT v_limit
    ),
    open_rows AS (
      SELECT o.*
      FROM public.store_orders o
      WHERE v_status = ''
        AND v_cursor_created IS NULL
        AND NOT v_has_range
        AND o.store_id = p_store_id
        AND o.order_status IN (
          'pending', 'accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived',
          'cancel_requested', 'refund_requested'
        )
        AND NOT EXISTS (SELECT 1 FROM win_rows w WHERE w.id = o.id)
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 300
    ),
    page_rows AS (
      SELECT * FROM win_rows
      UNION ALL
      SELECT * FROM open_rows
    ),
    -- 다음 페이지 커서 = 이번 페이지 마지막 행(커서 조건이 「미만」이라 그 다음 행부터 이어짐).
    -- 이전: 다음 페이지 첫 행을 커서로 줘서 페이지마다 1건씩 빠졌음(운영 정의에서 재현 · 2026-11-03).
    next_row AS (
      SELECT w.created_at, w.id
      FROM win_rows w
      WHERE (SELECT count(*) FROM order_rows) > v_limit
      ORDER BY w.created_at ASC, w.id ASC
      LIMIT 1
    ),
    items_agg AS (
      SELECT
        i.order_id,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'order_id', i.order_id,
              'product_id', i.product_id,
              'product_title_snapshot', i.product_title_snapshot,
              'price_snapshot', i.price_snapshot,
              'qty', i.qty,
              'subtotal', i.subtotal,
              'options_snapshot_json', i.options_snapshot_json
            )
            ORDER BY i.id
          ),
          '[]'::jsonb
        ) AS items
      FROM public.store_order_items i
      WHERE i.order_id IN (SELECT id FROM page_rows)
      GROUP BY i.order_id
    ),
    review_ids AS (
      SELECT r.order_id
      FROM public.store_reviews r
      WHERE v_reviews_exist
        AND r.order_id IN (SELECT id FROM page_rows)
    ),
    orders_json AS (
      SELECT coalesce(
        jsonb_agg(
          to_jsonb(pr) - 'buyer_user_id_raw' - 'display_name' - 'nickname' - 'username'
          || jsonb_build_object(
            'buyer_user_id', pr.buyer_user_id_raw,
            'buyer_public_label', public.owner_orders_list_buyer_public_label(pr.display_name, pr.nickname, pr.username),
            'items', coalesce(ia.items, '[]'::jsonb),
            'review_status',
              CASE
                WHEN pr.order_status <> 'completed' THEN 'not_applicable'
                WHEN v_reviews_exist AND ri.order_id IS NOT NULL THEN 'completed'
                WHEN NOT v_reviews_exist THEN 'unavailable'
                ELSE 'pending'
              END
          )
          ORDER BY pr.created_at DESC, pr.id DESC
        ),
        '[]'::jsonb
      ) AS orders
      FROM (
        SELECT
          o.id,
          o.order_no,
          o.buyer_user_id AS buyer_user_id_raw,
          o.total_amount,
          o.payment_amount,
          o.delivery_fee_amount,
          o.delivery_courier_label,
          o.payment_status,
          o.order_status,
          o.fulfillment_type,
          o.buyer_note,
          o.buyer_phone,
          o.buyer_payment_method,
          o.buyer_payment_method_detail,
          o.delivery_address_summary,
          o.delivery_address_detail,
          o.delivery_user_address_id,
          o.delivery_place_id,
          o.delivery_formatted_address,
          o.delivery_detail_address,
          o.delivery_note,
          o.delivery_latitude,
          o.delivery_longitude,
          o.created_at,
          o.updated_at,
          o.completed_at,
          o.refunded_at,
          o.auto_complete_at,
          o.community_messenger_room_id,
          o.estimated_prep_minutes,
          o.estimated_ready_at,
          o.accepted_at,
          o.admin_locked,
          o.sla_warning_level,
          o.sla_warning_reason,
          o.sla_warning_at,
          o.needs_admin_attention,
          o.checkout_prep_minutes,
          o.checkout_ride_minutes,
          o.checkout_eta_minutes,
          o.checkout_eta_computed_at,
          o.checkout_route_distance_meters,
          o.checkout_straight_distance_meters,
          p.display_name,
          p.nickname,
          p.username
        FROM page_rows o
        LEFT JOIN public.profiles p ON p.id = o.buyer_user_id
      ) pr
      LEFT JOIN items_agg ia ON ia.order_id = pr.id
      LEFT JOIN review_ids ri ON ri.order_id = pr.id
    )
    SELECT jsonb_build_object(
      'ok', true,
      'orders', (SELECT orders FROM orders_json),
      'next_cursor', (
        SELECT CASE
          WHEN nr.id IS NULL THEN null
          ELSE to_char(nr.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || nr.id::text
        END
        FROM next_row nr
      ),
      'status_counts_optional', jsonb_build_object(
        'pending_accept_count', coalesce((v_dash->>'pending_accept_count')::int, 0),
        'refund_requested_count', coalesce((v_dash->>'refund_requested_count')::int, 0),
        'pending_delivery_count', coalesce((v_dash->>'pending_delivery_count')::int, 0)
      ),
      'store_pickup_address', (SELECT to_jsonb(sa) FROM store_addr sa),
      'updated_at', now()
    )
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_buyer_store_order_detail_snapshot(p_user_id uuid, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order jsonb;
  v_store_id uuid;
  v_items jsonb;
  v_store jsonb;
  v_delivery jsonb;
  v_review jsonb;
  v_hidden boolean := false;
BEGIN
  BEGIN
    SELECT EXISTS (
      SELECT 1
      FROM public.store_order_buyer_hides AS h
      WHERE h.buyer_user_id = p_user_id
        AND h.order_id = p_order_id
    )
    INTO v_hidden;
  EXCEPTION
    WHEN undefined_table THEN
      v_hidden := false;
  END;

  IF v_hidden THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- explicit buyer-visible order columns (no admin / dispute / commission / store-funding columns)
  SELECT to_jsonb(x)
  INTO v_order
  FROM (
    SELECT
      o.id, o.order_no, o.buyer_user_id, o.store_id,
      o.total_amount, o.discount_amount, o.payment_amount, o.payment_status, o.order_status,
      o.fulfillment_type, o.buyer_note, o.created_at, o.updated_at, o.auto_complete_at,
      o.buyer_phone, o.delivery_fee_amount, o.delivery_courier_label,
      o.delivery_address_summary, o.delivery_address_detail,
      o.buyer_payment_method, o.buyer_payment_method_detail,
      o.external_delivery_provider, o.external_delivery_order_id, o.external_delivery_status,
      o.external_delivery_updated_at,
      o.community_messenger_room_id, o.estimated_prep_minutes, o.estimated_ready_at, o.accepted_at,
      o.admin_locked, o.refund_approved_at, o.refunded_at,
      o.sla_warning_level, o.sla_warning_reason, o.sla_warning_at, o.needs_admin_attention,
      o.client_order_key, o.delivery_region, o.delivery_city,
      o.checkout_prep_minutes, o.checkout_ride_minutes, o.checkout_eta_minutes, o.checkout_eta_computed_at,
      o.delivery_user_address_id, o.checkout_route_distance_meters,
      o.delivery_place_id, o.delivery_formatted_address, o.delivery_detail_address, o.delivery_note,
      o.delivery_latitude, o.delivery_longitude, o.checkout_straight_distance_meters,
      o.coupon_campaign_id, o.user_coupon_id,
      o.coupon_offer_title, o.coupon_number, o.gift_redemption_amount, o.amount_before_gift,
      o.checkout_store_latitude, o.checkout_store_longitude,
      o.checkout_serviceability_eligible, o.checkout_serviceability_max_km, o.checkout_serviceability_reason
    FROM public.store_orders AS o
    WHERE o.id = p_order_id
      AND o.buyer_user_id = p_user_id
  ) AS x;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_store_id := (v_order->>'store_id')::uuid;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'order_id', i.order_id,
        'product_id', i.product_id,
        'product_title_snapshot', i.product_title_snapshot,
        'price_snapshot', i.price_snapshot,
        'qty', i.qty,
        'subtotal', i.subtotal,
        'options_snapshot_json', i.options_snapshot_json,
        'base_price_snapshot', i.base_price_snapshot,
        'options_unit_delta_snapshot', i.options_unit_delta_snapshot
      )
      ORDER BY i.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.store_order_items AS i
  WHERE i.order_id = p_order_id;

  SELECT jsonb_build_object(
    'store_name', s.store_name,
    'slug', s.slug,
    'owner_user_id', s.owner_user_id,
    'region', s.region,
    'city', s.city,
    'district', s.district,
    'address_line1', s.address_line1,
    'address_line2', s.address_line2
  )
  INTO v_store
  FROM public.stores AS s
  WHERE s.id = v_store_id;

  -- explicit buyer delivery columns (no proof url/path, no coordinates, no admin_note,
  -- no rider-internal decline/failure reasons or notes; receiver name is masked in the web layer)
  SELECT to_jsonb(x)
  INTO v_delivery
  FROM (
    SELECT
      d.order_id, d.store_id, d.buyer_user_id, d.rider_id, d.delivery_status,
      d.assigned_at, d.picked_up_at, d.delivered_at, d.created_at, d.updated_at,
      d.rider_accepted_at, d.customer_arrived_at,
      d.delivered_receiver_name, d.delivered_confirmed_at, d.failed_at
    FROM public.store_order_deliveries AS d
    WHERE d.order_id = p_order_id
  ) AS x;

  SELECT to_jsonb(r.*)
  INTO v_review
  FROM public.store_reviews AS r
  WHERE r.order_id = p_order_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'order', v_order,
    'items', v_items,
    'store', coalesce(v_store, '{}'::jsonb),
    'delivery', v_delivery,
    'review', v_review
  );
EXCEPTION
  WHEN undefined_table THEN
    RETURN jsonb_build_object('ok', false, 'error', 'schema_incomplete');
END;
$function$;


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
      coalesce(o.payment_amount, 0) + coalesce(o.gift_redemption_amount, 0) + coalesce(o.platform_funded_amount, 0)
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
      sum(CASE WHEN order_status = 'pending' AND fulfillment_type = 'local_delivery' THEN 1 ELSE 0 END), 0
    )::int AS pending_delivery_count,
    coalesce(
      sum(
        CASE WHEN order_status IN ('accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived') THEN 1 ELSE 0 END
      ),
      0
    )::int AS in_progress_count,
    coalesce(
      sum(
        CASE WHEN order_status = 'pending' AND created_at < (SELECT pending_3m_cutoff FROM day_bounds) THEN 1 ELSE 0 END
      ),
      0
    )::int AS pending_over_3m_count,
    coalesce(sum(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END), 0)::int AS flow_waiting_count,
    coalesce(sum(CASE WHEN order_status IN ('accepted', 'preparing') THEN 1 ELSE 0 END), 0)::int AS flow_cooking_count,
    coalesce(
      sum(CASE WHEN order_status IN ('ready_for_pickup', 'delivering', 'arrived') THEN 1 ELSE 0 END), 0
    )::int AS flow_delivering_count,
    coalesce(
      sum(CASE WHEN completed_at >= (SELECT today_start FROM day_bounds) THEN 1 ELSE 0 END), 0
    )::int AS flow_completed_today_count,
    coalesce(
      sum(CASE WHEN created_at >= (SELECT today_start FROM day_bounds) THEN 1 ELSE 0 END), 0
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
      sum(CASE WHEN completed_at >= (SELECT today_start FROM day_bounds) THEN sale_amount ELSE 0 END), 0
    )::numeric
      - coalesce(
        sum(
          CASE
            WHEN order_status = 'refunded' AND completed_at IS NOT NULL AND refunded_at >= (SELECT today_start FROM day_bounds)
              THEN sale_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS today_completed_sales_amount,
    coalesce(
      sum(
        CASE
          WHEN completed_at >= (SELECT yesterday_start FROM day_bounds) AND completed_at < (SELECT today_start FROM day_bounds)
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
      sum(CASE WHEN dispute_status IS NOT NULL AND dispute_status <> '' THEN 1 ELSE 0 END), 0
    )::int AS active_dispute_count,
    coalesce(
      sum(
        CASE
          WHEN order_status = 'preparing'
            AND (sla_warning_reason = 'eta_overdue' OR (estimated_ready_at IS NOT NULL AND estimated_ready_at < now()))
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
      sum(CASE WHEN order_status = 'preparing' AND sla_warning_reason = 'eta_overdue' THEN 1 ELSE 0 END), 0
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
          WHEN order_status IN ('ready_for_pickup', 'delivering', 'arrived') AND sla_warning_reason = 'unassigned_over_10m'
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


DROP TRIGGER IF EXISTS trg_store_order_events_set_cancel_kind ON public.store_order_events;
DROP FUNCTION IF EXISTS public.store_order_events_set_cancel_kind();
DROP FUNCTION IF EXISTS public.store_order_cancel_kind_from_event(text, text);
ALTER TABLE public.store_orders DROP CONSTRAINT IF EXISTS store_orders_cancel_kind_check;
ALTER TABLE public.store_orders DROP COLUMN IF EXISTS cancel_kind;
