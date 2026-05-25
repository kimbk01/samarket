-- OOL1: Owner store orders list snapshot — unified RPC (1 PostgREST RTT cold path).
-- Semantics aligned with GET /api/me/stores/[storeId]/orders (created_at DESC, limit 60 default).

CREATE TABLE IF NOT EXISTS public.owner_store_orders_list_snapshots (
  store_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  list_scope text NOT NULL DEFAULT 'default',
  status_filter text NOT NULL DEFAULT '',
  list_limit integer NOT NULL DEFAULT 60,
  cursor_key text NOT NULL DEFAULT '',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, owner_user_id, list_scope, status_filter, list_limit, cursor_key)
);

COMMENT ON TABLE public.owner_store_orders_list_snapshots IS
  'Precomputed owner store orders list (orders + items + buyer labels + review_status). Event-driven refresh; read path 1 PK select.';

CREATE INDEX IF NOT EXISTS idx_owner_store_orders_list_snapshots_updated
  ON public.owner_store_orders_list_snapshots (updated_at DESC);

ALTER TABLE public.owner_store_orders_list_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owner_orders_list_buyer_public_label(
  p_display_name text,
  p_nickname text,
  p_username text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    nullif(
      trim(
        CASE
          WHEN coalesce(trim(p_display_name), trim(p_nickname), '') <> ''
               AND coalesce(trim(p_username), '') <> ''
               AND lower(coalesce(trim(p_display_name), trim(p_nickname))) <> lower(trim(regexp_replace(p_username, '^@+', '')))
            THEN coalesce(trim(p_display_name), trim(p_nickname)) || ' (@' || trim(regexp_replace(p_username, '^@+', '')) || ')'
          WHEN coalesce(trim(p_display_name), trim(p_nickname), '') <> ''
            THEN coalesce(trim(p_display_name), trim(p_nickname))
          WHEN coalesce(trim(p_username), '') <> ''
            THEN '@' || trim(regexp_replace(p_username, '^@+', ''))
          ELSE ''
        END
      ),
      ''
    ),
    '사마켓 회원'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_owner_store_orders_list_snapshot(
  p_store_id uuid,
  p_owner_user_id uuid,
  p_status text DEFAULT '',
  p_limit integer DEFAULT 60,
  p_cursor text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_ok boolean := false;
  v_limit integer := greatest(1, least(120, coalesce(p_limit, 60)));
  v_status text := coalesce(trim(p_status), '');
  v_cursor text := coalesce(trim(p_cursor), '');
  v_cursor_created timestamptz;
  v_cursor_id uuid;
  v_dash jsonb;
  v_reviews_exist boolean := false;
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
          v_cursor_created IS NULL
          OR o.created_at < v_cursor_created
          OR (o.created_at = v_cursor_created AND o.id < v_cursor_id)
        )
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT v_limit + 1
    ),
    page_rows AS (
      SELECT * FROM order_rows LIMIT v_limit
    ),
    next_row AS (
      SELECT created_at, id FROM order_rows OFFSET v_limit LIMIT 1
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
          o.auto_complete_at,
          o.community_messenger_room_id,
          o.estimated_prep_minutes,
          o.estimated_ready_at,
          o.accepted_at,
          o.admin_locked,
          o.admin_flagged,
          o.dispute_status,
          o.admin_note,
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
$$;

COMMENT ON FUNCTION public.get_owner_store_orders_list_snapshot(uuid, uuid, text, integer, text) IS
  'OOL1 owner orders list — gate + orders + items + buyer labels + review_status in one SQL snapshot.';

REVOKE ALL ON FUNCTION public.get_owner_store_orders_list_snapshot(uuid, uuid, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_owner_store_orders_list_snapshot(uuid, uuid, text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_owner_store_orders_list_snapshot(uuid, uuid, text, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_store_orders_list_snapshot(uuid, uuid, text, integer, text) TO service_role;
