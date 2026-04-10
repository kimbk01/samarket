-- 채팅/커뮤니티 핫패스 인덱스 보강
-- 목적:
-- 1) 거래 채팅 레거시 메시지(product_chat_messages) 타임라인/읽음 처리 가속
-- 2) 구매자 기준 거래방 탐색/글 기준 채팅 목록 탐색 가속
-- 3) 내 커뮤니티 활동 댓글 타임라인 가속

DO $$
BEGIN
  IF to_regclass('public.product_chat_messages') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_product_chat_messages_room_created
      ON public.product_chat_messages (product_chat_id, created_at ASC)
    ';

    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_product_chat_messages_room_unread
      ON public.product_chat_messages (product_chat_id, created_at ASC)
      WHERE read_at IS NULL
    ';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.chat_rooms') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_chat_rooms_item_trade_buyer_updated
      ON public.chat_rooms (buyer_id, updated_at DESC)
      WHERE room_type = 'item_trade'
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.product_chats') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_product_chats_post_seller_last_at
      ON public.product_chats (post_id, seller_id, last_message_at DESC NULLS LAST)
    ';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.community_comments') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_community_comments_user_created
      ON public.community_comments (user_id, created_at DESC)
    ';
  END IF;
END $$;
