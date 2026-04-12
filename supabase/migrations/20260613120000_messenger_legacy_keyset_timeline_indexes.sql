-- 레거시 product_chat_messages: 최근 N건 DESC + (created_at,id) 키셋 과거 페이지
-- 커뮤니티 메신저: 부트스트랩 쿼리 ORDER BY created_at DESC, id DESC 와 정합

DO $$
BEGIN
  IF to_regclass('public.product_chat_messages') IS NOT NULL THEN
    EXECUTE $i$
      CREATE INDEX IF NOT EXISTS idx_product_chat_messages_room_created_id_desc_keyset
        ON public.product_chat_messages (product_chat_id, created_at DESC NULLS LAST, id DESC NULLS LAST)
    $i$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.community_messenger_messages') IS NOT NULL THEN
    EXECUTE $i$
      CREATE INDEX IF NOT EXISTS community_messenger_messages_room_created_at_id_desc_keyset_idx
        ON public.community_messenger_messages (room_id, created_at DESC NULLS LAST, id DESC NULLS LAST)
    $i$;
  END IF;
END $$;
