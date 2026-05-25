-- SOL1: Buyer store orders list snapshot — unified RPC (1 PostgREST RTT cold path).
-- Semantics aligned with GET /api/me/store-orders (created_at DESC, limit 100 default, buyer hides excluded).

CREATE TABLE IF NOT EXISTS public.buyer_store_orders_list_snapshots (
  buyer_user_id uuid NOT NULL,
  list_scope text NOT NULL DEFAULT 'default',
  status_filter text NOT NULL DEFAULT '',
  list_limit integer NOT NULL DEFAULT 100,
  cursor_key text NOT NULL DEFAULT '',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (buyer_user_id, list_scope, status_filter, list_limit, cursor_key)
);

COMMENT ON TABLE public.buyer_store_orders_list_snapshots IS
  'Precomputed buyer store orders list (orders + items + store preview + review + unread). Event-driven refresh; read path 1 PK select.';

CREATE INDEX IF NOT EXISTS idx_buyer_store_orders_list_snapshots_updated
  ON public.buyer_store_orders_list_snapshots (updated_at DESC);

ALTER TABLE public.buyer_store_orders_list_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_buyer_store_orders_list_snapshot(
  p_user_id uuid,
  p_status text DEFAULT '',
  p_limit integer DEFAULT 100,
  p_cursor text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := greatest(1, least(100, coalesce(p_limit, 100)));
  v_status text := coalesce(trim(p_status), '');
  v_cursor text := coalesce(trim(p_cursor), '');
  v_cursor_created timestamptz;
  v_cursor_id uuid;
  v_reviews_exist boolean := false;
  v_hides_exist boolean := false;
  v_participants_exist boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized', 'updated_at', now());
  END IF;

  SELECT to_regclass('public.store_reviews') IS NOT NULL INTO v_reviews_exist;
  SELECT to_regclass('public.store_order_buyer_hides') IS NOT NULL INTO v_hides_exist;
  SELECT to_regclass('public.community_messenger_participants') IS NOT NULL INTO v_participants_exist;

  IF v_cursor <> '' THEN
    BEGIN
      v_cursor_created := split_part(v_cursor, '|', 1)::timestamptz;
      v_cursor_id := split_part(v_cursor, '|', 2)::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_cursor_created := NULL;
      v_cursor_id := NULL;
    END;
  END IF;

  RETURN (
    WITH order_rows AS (
      SELECT o.*
      FROM public.store_orders o
      WHERE o.buyer_user_id = p_user_id
        AND (v_status = '' OR o.order_status = v_status)
        AND (
          NOT v_hides_exist
          OR NOT EXISTS (
            SELECT 1
            FROM public.store_order_buyer_hides h
            WHERE h.order_id = o.id
              AND h.buyer_user_id = p_user_id
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
    orders_json AS (
      SELECT coalesce(
        jsonb_agg(
          to_jsonb(o)
          || jsonb_build_object(
            'store_name', coalesce(s.store_name, ''),
            'store_slug', coalesce(nullif(trim(s.slug), ''), ''),
            'store_profile_image_url',
              CASE
                WHEN s.profile_image_url IS NOT NULL AND trim(s.profile_image_url) <> '' THEN trim(s.profile_image_url)
                ELSE null
              END,
            'items', coalesce(ia.items, '[]'::jsonb),
            'review',
              CASE
                WHEN v_reviews_exist THEN (
                  SELECT to_jsonb(r) - 'order_id' - 'store_id' - 'buyer_user_id' - 'created_at' - 'updated_at'
                  FROM public.store_reviews r
                  WHERE r.order_id = o.id
                  LIMIT 1
                )
                ELSE null
              END,
            'order_chat_unread_count',
              CASE
                WHEN v_participants_exist
                     AND o.community_messenger_room_id IS NOT NULL
                     AND trim(o.community_messenger_room_id::text) <> '' THEN
                  coalesce((
                    SELECT greatest(0, floor(coalesce(p.unread_count, 0))::integer)
                    FROM public.community_messenger_participants p
                    WHERE p.room_id = o.community_messenger_room_id
                      AND p.user_id = p_user_id
                    LIMIT 1
                  ), 0)
                ELSE 0
              END
          )
          ORDER BY o.created_at DESC, o.id DESC
        ),
        '[]'::jsonb
      ) AS orders
      FROM page_rows o
      LEFT JOIN public.stores s ON s.id = o.store_id
      LEFT JOIN items_agg ia ON ia.order_id = o.id
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
      'reviews_unavailable', NOT v_reviews_exist,
      'snapshot_version', floor(extract(epoch from now()) * 1000)::bigint,
      'updated_at', now()
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_buyer_store_orders_list_snapshot(uuid, text, integer, text) IS
  'SOL1 buyer orders list — orders + items + store preview + review + unread in one SQL snapshot.';

REVOKE ALL ON FUNCTION public.get_buyer_store_orders_list_snapshot(uuid, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_buyer_store_orders_list_snapshot(uuid, text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_buyer_store_orders_list_snapshot(uuid, text, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_buyer_store_orders_list_snapshot(uuid, text, integer, text) TO service_role;
