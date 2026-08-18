-- Home-sync critical snapshot: include store identity on store_orders rows.
-- List first paint uses this payload; do not wait for client hydrate.

CREATE OR REPLACE FUNCTION public.get_community_messenger_home_sync_snapshot(
  p_user_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cap AS (
    SELECT least(greatest(coalesce(p_limit, 20), 1), 30)::integer AS n
  ),
  lite AS (
    SELECT public.community_messenger_bootstrap_lite_my_rooms_bundle(
      p_user_id,
      (SELECT n FROM cap)
    ) AS j
  ),
  lite_rooms AS (
    SELECT r
    FROM lite,
      jsonb_array_elements(coalesce(lite.j->'rooms', '[]'::jsonb)) AS r
  ),
  trade_rooms AS (
    SELECT
      (r->>'id')::uuid AS room_id,
      trim(coalesce(r->>'direct_key', '')) AS direct_key
    FROM lite_rooms
    WHERE coalesce(r->>'room_type', '') = 'direct'
      AND (
        trim(coalesce(r->>'direct_key', '')) LIKE 'trade_pc:%'
        OR trim(coalesce(r->>'direct_key', '')) LIKE 'trade_item:%'
      )
  ),
  delivery_rooms AS (
    SELECT
      (r->>'id')::uuid AS room_id,
      trim(coalesce(r->>'direct_key', '')) AS direct_key
    FROM lite_rooms
    WHERE coalesce(r->>'room_type', '') = 'direct'
      AND (
        trim(coalesce(r->>'direct_key', '')) LIKE 'store_order:%'
        OR trim(coalesce(r->>'direct_key', '')) LIKE 'trade_order:%'
      )
  ),
  trade_cm_ids AS (
    SELECT coalesce(array_agg(DISTINCT room_id) FILTER (WHERE room_id IS NOT NULL), '{}'::uuid[]) AS ids
    FROM trade_rooms
  ),
  trade_pc_ids AS (
    SELECT coalesce(
      array_agg(DISTINCT (substring(direct_key FROM 10))::uuid)
        FILTER (WHERE direct_key LIKE 'trade_pc:%' AND length(trim(substring(direct_key FROM 10))) > 0),
      '{}'::uuid[]
    ) AS ids
    FROM trade_rooms
    WHERE direct_key LIKE 'trade_pc:%'
  ),
  delivery_cm_ids AS (
    SELECT coalesce(array_agg(DISTINCT room_id) FILTER (WHERE room_id IS NOT NULL), '{}'::uuid[]) AS ids
    FROM delivery_rooms
  ),
  delivery_order_ids AS (
    SELECT coalesce(
      array_agg(DISTINCT
        CASE
          WHEN direct_key LIKE 'store_order:%' THEN nullif(trim(substring(direct_key FROM 13)), '')::uuid
          WHEN direct_key LIKE 'trade_order:%' THEN nullif(trim(substring(direct_key FROM 13)), '')::uuid
          ELSE NULL
        END
      ) FILTER (WHERE direct_key LIKE 'store_order:%' OR direct_key LIKE 'trade_order:%'),
      '{}'::uuid[]
    ) AS ids
    FROM delivery_rooms
  ),
  hs5 AS (
    SELECT public.home_sync_hs5_unread_legacy_bundle(
      (SELECT ids FROM trade_cm_ids),
      (SELECT ids FROM trade_pc_ids)
    ) AS j
  ),
  pc_rows AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', pc.id,
          'post_id', pc.post_id,
          'seller_id', pc.seller_id,
          'buyer_id', pc.buyer_id,
          'trade_flow_status', pc.trade_flow_status,
          'chat_mode', pc.chat_mode,
          'seller_completed_at', pc.seller_completed_at,
          'buyer_confirmed_at', pc.buyer_confirmed_at,
          'community_messenger_room_id', pc.community_messenger_room_id
        )
      ),
      '[]'::jsonb
    ) AS j
    FROM product_chats pc
    WHERE (
      cardinality((SELECT ids FROM trade_pc_ids)) > 0
      AND pc.id IN (SELECT unnest(ids) FROM trade_pc_ids)
    )
    OR (
      cardinality((SELECT ids FROM trade_cm_ids)) > 0
      AND pc.community_messenger_room_id IN (SELECT unnest(ids) FROM trade_cm_ids)
    )
  ),
  store_order_rows AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', so.id,
          'order_status', so.order_status,
          'community_messenger_room_id', so.community_messenger_room_id,
          'store_id', so.store_id,
          'store_name', st.store_name,
          'profile_image_url', st.profile_image_url
        )
      ),
      '[]'::jsonb
    ) AS j
    FROM store_orders so
    LEFT JOIN stores st ON st.id = so.store_id
    WHERE (
      cardinality((SELECT ids FROM delivery_order_ids)) > 0
      AND so.id IN (SELECT unnest(ids) FROM delivery_order_ids)
    )
    OR (
      cardinality((SELECT ids FROM delivery_cm_ids)) > 0
      AND so.community_messenger_room_id IN (SELECT unnest(ids) FROM delivery_cm_ids)
    )
  ),
  store_order_id_set AS (
    SELECT coalesce(
      array_agg(DISTINCT (elem->>'id')::uuid) FILTER (WHERE nullif(trim(elem->>'id'), '') IS NOT NULL),
      '{}'::uuid[]
    ) AS ids
    FROM store_order_rows,
      jsonb_array_elements(store_order_rows.j) AS elem
  ),
  order_completed_events AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', e.order_id,
          'created_at', e.created_at,
          'event_type', e.event_type
        )
      ),
      '[]'::jsonb
    ) AS j
    FROM store_order_events e
    WHERE e.event_type = 'order_completed'
      AND cardinality((SELECT ids FROM store_order_id_set)) > 0
      AND e.order_id IN (SELECT unnest(ids) FROM store_order_id_set)
  )
  SELECT jsonb_build_object(
    'lite_bundle', (SELECT j FROM lite),
    'hs5', (SELECT j FROM hs5),
    'commerce_lifecycle', jsonb_build_object(
      'product_chats', (SELECT j FROM pc_rows),
      'store_orders', (SELECT j FROM store_order_rows),
      'order_completed_events', (SELECT j FROM order_completed_events)
    ),
    'room_cap', (SELECT n FROM cap)
  );
$$;

COMMENT ON FUNCTION public.get_community_messenger_home_sync_snapshot(uuid, integer) IS
  'Home-sync critical cold path — lite rooms + HS5 unread + commerce lifecycle (store_orders include store_name).';

REVOKE ALL ON FUNCTION public.get_community_messenger_home_sync_snapshot(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_messenger_home_sync_snapshot(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_community_messenger_home_sync_snapshot(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_messenger_home_sync_snapshot(uuid, integer) TO service_role;
