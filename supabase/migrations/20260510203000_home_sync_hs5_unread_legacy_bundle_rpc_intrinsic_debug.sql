-- HS5-RPC-DEEP: home_sync_hs5_unread_legacy_bundle 내부 단계 계측만 추가 (동작·컬럼 동일).
-- 반환: chatRows, pcRows, _hs5RpcDebug (서버 측 clock_timestamp 구간 ms).

CREATE OR REPLACE FUNCTION public.home_sync_hs5_unread_legacy_bundle(
  p_cm_room_ids uuid[],
  p_pc_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  t_start timestamptz;
  t_chat_end timestamptz;
  t_pc_end timestamptz;
  t_merge_start timestamptz;
  t_merge_end timestamptz;
  t_json_start timestamptz;
  t_after_dbg timestamptz;
  t_end timestamptz;
  chat_json jsonb;
  pc_json jsonb;
  dbg jsonb;
  result jsonb;
  room_ids_count int;
  pc_ids_count int;
  chat_row_count int;
  pc_row_count int;
  ms_chat numeric;
  ms_pc numeric;
  ms_merge numeric;
  ms_json numeric;
  ms_total numeric;
BEGIN
  t_start := clock_timestamp();
  room_ids_count := coalesce(array_length(p_cm_room_ids, 1), 0);
  pc_ids_count := coalesce(array_length(p_pc_ids, 1), 0);

  -- chat_rooms + jsonb_agg (단일 구간)
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO chat_json
  FROM (
    SELECT id, community_messenger_room_id
    FROM public.chat_rooms
    WHERE room_type = 'item_trade'
      AND community_messenger_room_id = ANY (COALESCE(p_cm_room_ids, '{}'::uuid[]))
  ) t;
  t_chat_end := clock_timestamp();

  -- product_chats + jsonb_agg
  SELECT coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
  INTO pc_json
  FROM (
    SELECT
      id,
      seller_id,
      buyer_id,
      unread_count_seller,
      unread_count_buyer
    FROM public.product_chats
    WHERE id = ANY (COALESCE(p_pc_ids, '{}'::uuid[]))
  ) u;
  t_pc_end := clock_timestamp();

  -- merge: 행 수·페이로드 껍데기 조립(경량) — dedupe는 TS 측과 동일하게 유지
  t_merge_start := clock_timestamp();
  chat_row_count := coalesce(jsonb_array_length(chat_json), 0);
  pc_row_count := coalesce(jsonb_array_length(pc_json), 0);
  PERFORM jsonb_build_object('chatRows', chat_json, 'pcRows', pc_json);
  t_merge_end := clock_timestamp();

  ms_chat := extract(epoch FROM (t_chat_end - t_start)) * 1000;
  ms_pc := extract(epoch FROM (t_pc_end - t_chat_end)) * 1000;
  ms_merge := extract(epoch FROM (t_merge_end - t_merge_start)) * 1000;

  -- json 메타 조립(행 데이터의 jsonb_agg 는 위 chat/product 구간에 포함)
  t_json_start := clock_timestamp();
  dbg := jsonb_build_object(
    'rpc_chat_rooms_ms', round(ms_chat::numeric, 3),
    'rpc_product_chats_ms', round(ms_pc::numeric, 3),
    'rpc_merge_ms', round(ms_merge::numeric, 3),
    'rpc_room_ids_count', room_ids_count,
    'rpc_product_chat_ids_count', pc_ids_count,
    'rpc_chat_rows_count', chat_row_count,
    'rpc_product_rows_count', pc_row_count
  );
  t_after_dbg := clock_timestamp();
  ms_json := extract(epoch FROM (t_after_dbg - t_json_start)) * 1000;

  dbg := dbg
    || jsonb_build_object(
      'rpc_json_build_ms', round(ms_json::numeric, 3)
    );

  result := jsonb_build_object(
    'chatRows', chat_json,
    'pcRows', pc_json,
    '_hs5RpcDebug', dbg
  );
  t_end := clock_timestamp();
  ms_total := extract(epoch FROM (t_end - t_start)) * 1000;
  dbg := jsonb_set(
    dbg,
    '{rpc_total_ms}',
    to_jsonb(round(ms_total::numeric, 3))
  );
  result := jsonb_build_object(
    'chatRows', chat_json,
    'pcRows', pc_json,
    '_hs5RpcDebug', dbg
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.home_sync_hs5_unread_legacy_bundle(uuid[], uuid[]) IS
  'HS5: item_trade 링크 + product_chats unread 컬럼 단일 호출. HS5-RPC-DEEP: _hs5RpcDebug 단계 ms.';
