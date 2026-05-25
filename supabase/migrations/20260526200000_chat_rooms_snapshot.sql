-- CR1: Trade chat rooms list snapshot — unified RPC (1 PostgREST RTT cold path).
-- Semantics aligned with GET /api/chat/rooms (trade + store_order segments).

CREATE TABLE IF NOT EXISTS public.trade_chat_rooms_snapshots (
  user_id uuid NOT NULL,
  list_scope text NOT NULL DEFAULT 'default',
  list_limit integer NOT NULL DEFAULT 200,
  cursor_key text NOT NULL DEFAULT '',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list_scope, list_limit, cursor_key)
);

COMMENT ON TABLE public.trade_chat_rooms_snapshots IS
  'Precomputed trade chat rooms list bundles (product_chats + chat_rooms + profiles + orders). Event-driven refresh; read path 1 PK select.';

CREATE INDEX IF NOT EXISTS idx_trade_chat_rooms_snapshots_updated
  ON public.trade_chat_rooms_snapshots (updated_at DESC);

ALTER TABLE public.trade_chat_rooms_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_chat_rooms_snapshot(
  p_user_id uuid,
  p_cursor text DEFAULT '',
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cap AS (
    SELECT greatest(1, least(coalesce(p_limit, 200), 200))::integer AS n
  ),
  pc_rows AS (
    SELECT coalesce(
      jsonb_agg(to_jsonb(pc) ORDER BY pc.last_message_at DESC NULLS LAST),
      '[]'::jsonb
    ) AS rows
    FROM (
      SELECT
        pc.id,
        pc.post_id,
        pc.seller_id,
        pc.buyer_id,
        pc.last_message_at,
        pc.last_message_preview,
        pc.unread_count_seller,
        pc.unread_count_buyer,
        pc.created_at,
        pc.seller_completed_at,
        pc.buyer_confirmed_at,
        pc.community_messenger_room_id
      FROM public.product_chats pc
      WHERE pc.seller_id = p_user_id OR pc.buyer_id = p_user_id
      ORDER BY pc.last_message_at DESC NULLS LAST
      LIMIT (SELECT n FROM cap)
    ) pc
  ),
  part_rows AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'room_id', p.room_id,
          'unread_count', p.unread_count,
          'last_read_message_id', p.last_read_message_id,
          'left_at', p.left_at,
          'is_active', p.is_active,
          'hidden', p.hidden
        )
      ),
      '[]'::jsonb
    ) AS rows
    FROM public.chat_room_participants p
    WHERE p.user_id = p_user_id
      AND coalesce(p.hidden, false) = false
      AND p.left_at IS NULL
      AND coalesce(p.is_active, true) = true
  ),
  room_ids AS (
    SELECT coalesce(array_agg(DISTINCT (elem->>'room_id')::uuid), '{}'::uuid[]) AS ids
    FROM part_rows,
      jsonb_array_elements(part_rows.rows) AS elem
    WHERE nullif(trim(elem->>'room_id'), '') IS NOT NULL
  ),
  cr_rows AS (
    SELECT coalesce(
      jsonb_agg(to_jsonb(cr)),
      '[]'::jsonb
    ) AS rows
    FROM public.chat_rooms cr
    WHERE cr.id IN (SELECT unnest(ids) FROM room_ids)
      AND cr.room_type IN ('item_trade', 'store_order')
  ),
  trade_last_ids AS (
    SELECT coalesce(
      array_agg(DISTINCT (elem->>'last_message_id')::uuid)
        FILTER (
          WHERE elem->>'last_message_id' IS NOT NULL
            AND trim(elem->>'last_message_id') <> ''
            AND elem->>'room_type' = 'item_trade'
        ),
      '{}'::uuid[]
    ) AS ids
    FROM cr_rows,
      jsonb_array_elements(cr_rows.rows) AS elem
  ),
  last_message_senders AS (
    SELECT coalesce(
      jsonb_agg(jsonb_build_object('id', m.id, 'sender_id', m.sender_id)),
      '[]'::jsonb
    ) AS rows
    FROM public.chat_messages m
    WHERE m.id IN (SELECT unnest(ids) FROM trade_last_ids)
  ),
  item_ids AS (
    SELECT coalesce(
      array_agg(DISTINCT (elem->>'item_id')::uuid)
        FILTER (WHERE elem->>'item_id' IS NOT NULL AND trim(elem->>'item_id') <> ''),
      '{}'::uuid[]
    ) AS ids
    FROM cr_rows,
      jsonb_array_elements(cr_rows.rows) AS elem
    WHERE elem->>'room_type' = 'item_trade'
  ),
  completion_pc AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'post_id', pc.post_id,
          'seller_id', pc.seller_id,
          'buyer_id', pc.buyer_id,
          'seller_completed_at', pc.seller_completed_at,
          'buyer_confirmed_at', pc.buyer_confirmed_at
        )
      ),
      '[]'::jsonb
    ) AS rows
    FROM public.product_chats pc
    WHERE pc.post_id IN (SELECT unnest(ids) FROM item_ids)
  ),
  post_id_union AS (
    SELECT DISTINCT pid AS id
    FROM (
      SELECT (elem->>'post_id')::uuid AS pid
      FROM pc_rows, jsonb_array_elements(pc_rows.rows) AS elem
      UNION
      SELECT (elem->>'item_id')::uuid AS pid
      FROM cr_rows, jsonb_array_elements(cr_rows.rows) AS elem
      WHERE elem->>'room_type' = 'item_trade'
    ) u
    WHERE pid IS NOT NULL
  ),
  posts_json AS (
    SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) AS rows
    FROM public.posts p
    WHERE p.id IN (SELECT id FROM post_id_union)
  ),
  partner_union AS (
    SELECT DISTINCT uid AS id
    FROM (
      SELECT CASE WHEN (elem->>'seller_id')::uuid = p_user_id THEN (elem->>'buyer_id')::uuid ELSE (elem->>'seller_id')::uuid END AS uid
      FROM pc_rows, jsonb_array_elements(pc_rows.rows) AS elem
      UNION
      SELECT (elem->>'seller_id')::uuid AS uid
      FROM cr_rows, jsonb_array_elements(cr_rows.rows) AS elem
      UNION
      SELECT (elem->>'buyer_id')::uuid AS uid
      FROM cr_rows, jsonb_array_elements(cr_rows.rows) AS elem
    ) u
    WHERE uid IS NOT NULL AND uid <> p_user_id
  ),
  profiles_json AS (
    SELECT coalesce(jsonb_agg(to_jsonb(pr)), '[]'::jsonb) AS rows
    FROM public.profiles pr
    WHERE pr.id IN (SELECT id FROM partner_union)
  ),
  missing_test AS (
    SELECT pu.id
    FROM partner_union pu
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = pu.id)
  ),
  test_users_json AS (
    SELECT coalesce(jsonb_agg(to_jsonb(tu)), '[]'::jsonb) AS rows
    FROM public.test_users tu
    WHERE tu.id IN (SELECT id FROM missing_test)
  ),
  order_ids AS (
    SELECT coalesce(
      array_agg(DISTINCT (elem->>'store_order_id')::uuid)
        FILTER (WHERE elem->>'store_order_id' IS NOT NULL AND trim(elem->>'store_order_id') <> ''),
      '{}'::uuid[]
    ) AS ids
    FROM cr_rows,
      jsonb_array_elements(cr_rows.rows) AS elem
    WHERE elem->>'room_type' = 'store_order'
  ),
  store_orders_json AS (
    SELECT coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) AS rows
    FROM public.store_orders o
    WHERE o.id IN (SELECT unnest(ids) FROM order_ids)
  ),
  store_ids AS (
    SELECT coalesce(array_agg(DISTINCT o.store_id), '{}'::uuid[]) AS ids
    FROM public.store_orders o
    WHERE o.id IN (SELECT unnest(ids) FROM order_ids)
  ),
  stores_json AS (
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) AS rows
    FROM public.stores s
    WHERE s.id IN (SELECT unnest(ids) FROM store_ids)
  ),
  user_lang AS (
    SELECT coalesce(pr.preferred_language, 'ko') AS lang
    FROM public.profiles pr
    WHERE pr.id = p_user_id
    LIMIT 1
  ),
  unread_participant AS (
    SELECT coalesce(sum((elem->>'unread_count')::integer), 0) AS n
    FROM part_rows, jsonb_array_elements(part_rows.rows) AS elem
  ),
  unread_pc AS (
    SELECT coalesce(
      sum(
        CASE
          WHEN (elem->>'seller_id')::uuid = p_user_id THEN (elem->>'unread_count_seller')::integer
          ELSE (elem->>'unread_count_buyer')::integer
        END
      ),
      0
    ) AS n
    FROM pc_rows, jsonb_array_elements(pc_rows.rows) AS elem
  )
  SELECT jsonb_build_object(
    'ok', true,
    'product_chats', (SELECT rows FROM pc_rows),
    'participants', (SELECT rows FROM part_rows),
    'chat_rooms', (SELECT rows FROM cr_rows),
    'last_message_senders', (SELECT rows FROM last_message_senders),
    'completion_product_chats', (SELECT rows FROM completion_pc),
    'posts', (SELECT rows FROM posts_json),
    'profiles', (SELECT rows FROM profiles_json),
    'test_users', (SELECT rows FROM test_users_json),
    'store_orders', (SELECT rows FROM store_orders_json),
    'stores', (SELECT rows FROM stores_json),
    'user_lang', (SELECT lang FROM user_lang),
    'rooms', '[]'::jsonb,
    'unread_snapshot', jsonb_build_object(
      'participant_unread_total', (SELECT n FROM unread_participant),
      'product_chat_unread_total', (SELECT n FROM unread_pc)
    ),
    'next_cursor', null,
    'snapshot_version', floor(extract(epoch from now()) * 1000)::bigint,
    'list_limit', (SELECT n FROM cap),
    'updated_at', now()
  );
$$;

COMMENT ON FUNCTION public.get_chat_rooms_snapshot(uuid, text, integer) IS
  'CR1 trade chat rooms list — single RTT bundle for snapshot-first read path.';

REVOKE ALL ON FUNCTION public.get_chat_rooms_snapshot(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_chat_rooms_snapshot(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_chat_rooms_snapshot(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_rooms_snapshot(uuid, text, integer) TO service_role;
