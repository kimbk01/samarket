-- 채팅 런타임 핫패스 인덱스 보강
-- 대상: 거래채팅/배달주문/메신저 공통 방 상세 + 목록 API

DO $$
BEGIN
  IF to_regclass('public.chat_room_participants') IS NOT NULL THEN
    -- 목록: user_id + hidden=false 후 room_id/unread_count 사용
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_chat_room_participants_user_visible_active
      ON public.chat_room_participants (user_id, room_id)
      WHERE hidden = false AND (is_active IS DISTINCT FROM false) AND left_at IS NULL
    ';

    -- 상세: room_id + user_id 단건 권한 확인/미읽음 조회
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_chat_room_participants_room_user_active
      ON public.chat_room_participants (room_id, user_id)
      WHERE hidden = false AND (is_active IS DISTINCT FROM false)
    ';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.chat_rooms') IS NOT NULL THEN
    -- 거래 상세: item_trade 동일 대화 room 탐색
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_chat_rooms_item_trade_lookup_updated
      ON public.chat_rooms (room_type, item_id, seller_id, buyer_id, updated_at DESC)
      WHERE room_type = 'item_trade'
    $sql$;

    -- 거래 상세(레거시 fallback): seller 매칭 없이 buyer 기준 후보 탐색
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_chat_rooms_item_trade_item_buyer_updated
      ON public.chat_rooms (room_type, item_id, buyer_id, updated_at DESC)
      WHERE room_type = 'item_trade'
    $sql$;

    -- 모임 채팅 연결 복구: meeting_id + room_type + created_at
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_chat_rooms_meeting_room_type_created
      ON public.chat_rooms (meeting_id, room_type, created_at ASC)
      WHERE meeting_id IS NOT NULL
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.product_chats') IS NOT NULL THEN
    -- 상세 fallback: post_id + seller_id + buyer_id로 product_chats 역조회
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_product_chats_post_seller_buyer
      ON public.product_chats (post_id, seller_id, buyer_id)
    ';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.meetings') IS NOT NULL THEN
    -- 목록: chat_room_id IN (...) 역매핑
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_meetings_chat_room_id_not_null
      ON public.meetings (chat_room_id)
      WHERE chat_room_id IS NOT NULL
    ';
  END IF;
END $$;

