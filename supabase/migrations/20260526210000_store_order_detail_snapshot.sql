-- SOD1: Store order detail snapshot — counter table + unified RPC (1 PostgREST RTT cold path).
-- Buyer GET /api/me/store-orders/[orderId] — wraps get_buyer_store_order_detail_snapshot + timeline/unread bundles.

CREATE TABLE IF NOT EXISTS public.store_order_detail_snapshots (
  order_id uuid NOT NULL,
  viewer_user_id uuid NOT NULL,
  viewer_scope text NOT NULL DEFAULT 'buyer',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, viewer_user_id, viewer_scope)
);

COMMENT ON TABLE public.store_order_detail_snapshots IS
  'Precomputed buyer store order detail bundles. Event-driven refresh; read path 1 PK select.';

CREATE INDEX IF NOT EXISTS idx_store_order_detail_snapshots_updated
  ON public.store_order_detail_snapshots (updated_at DESC);

ALTER TABLE public.store_order_detail_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_store_order_detail_snapshot(
  p_order_id uuid,
  p_viewer_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base jsonb;
  v_timeline jsonb := '[]'::jsonb;
  v_unread integer := 0;
  v_rider jsonb := null;
BEGIN
  v_base := public.get_buyer_store_order_detail_snapshot(p_viewer_user_id, p_order_id);

  IF v_base IS NULL OR coalesce(v_base->>'ok', 'false') <> 'true' THEN
    RETURN coalesce(v_base, jsonb_build_object('ok', false, 'error', 'not_found'));
  END IF;

  BEGIN
    SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at), '[]'::jsonb)
    INTO v_timeline
    FROM public.store_order_events e
    WHERE e.order_id = p_order_id;
  EXCEPTION
    WHEN undefined_table THEN
      v_timeline := '[]'::jsonb;
  END;

  BEGIN
    SELECT coalesce(p.unread_count, 0)
    INTO v_unread
    FROM public.store_orders o
    LEFT JOIN public.chat_rooms cr
      ON cr.store_order_id = o.id AND cr.room_type = 'store_order'
    LEFT JOIN public.chat_room_participants p
      ON p.room_id = cr.id AND p.user_id = p_viewer_user_id
    WHERE o.id = p_order_id
      AND o.buyer_user_id = p_viewer_user_id
    LIMIT 1;
  EXCEPTION
    WHEN undefined_table THEN
      v_unread := 0;
  END;

  BEGIN
    SELECT jsonb_build_object(
      'rider_id', d.rider_id,
      'delivery_status', d.delivery_status,
      'assigned_at', d.assigned_at,
      'picked_up_at', d.picked_up_at,
      'delivered_at', d.delivered_at
    )
    INTO v_rider
    FROM public.store_order_deliveries d
    WHERE d.order_id = p_order_id
    LIMIT 1;
  EXCEPTION
    WHEN undefined_table THEN
      v_rider := null;
  END;

  RETURN v_base || jsonb_build_object(
    'payment', jsonb_build_object(
      'payment_status', v_base->'order'->'payment_status',
      'payment_amount', v_base->'order'->'payment_amount',
      'buyer_payment_method', v_base->'order'->'buyer_payment_method',
      'buyer_payment_method_detail', v_base->'order'->'buyer_payment_method_detail'
    ),
    'refund', jsonb_build_object(
      'order_status', v_base->'order'->'order_status'
    ),
    'rider', v_rider,
    'timeline', coalesce(v_timeline, '[]'::jsonb),
    'unread_snapshot', jsonb_build_object('unread_count', coalesce(v_unread, 0)),
    'snapshot_version', floor(extract(epoch from now()) * 1000)::bigint,
    'updated_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.get_store_order_detail_snapshot(uuid, uuid) IS
  'SOD1 buyer store order detail — order + items + store + delivery + review + timeline/unread in one RPC RTT.';

REVOKE ALL ON FUNCTION public.get_store_order_detail_snapshot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_store_order_detail_snapshot(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_store_order_detail_snapshot(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_order_detail_snapshot(uuid, uuid) TO service_role;
