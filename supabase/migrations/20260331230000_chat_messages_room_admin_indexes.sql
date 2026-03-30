-- 모임/통합 채팅: 방 단위 메시지 목록·관리자 요약·일괄 숨김(해제) 쿼리 부하 완화
-- chat_messages 테이블이 없거나 컬럼이 다르면 해당 구문만 건너뜁니다.

DO $$
BEGIN
  IF to_regclass('public.chat_messages') IS NULL THEN
    RAISE NOTICE 'chat_messages_room_admin_indexes: chat_messages 없음 — 건너뜀';
    RETURN;
  END IF;

  EXECUTE $i$
    CREATE INDEX IF NOT EXISTS chat_messages_room_id_created_at_desc_idx
      ON public.chat_messages (room_id, created_at DESC NULLS LAST)
  $i$;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_messages'
      AND column_name = 'is_hidden_by_admin'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_messages'
      AND column_name = 'message_type'
  ) THEN
    EXECUTE $i$
      CREATE INDEX IF NOT EXISTS chat_messages_room_visible_non_system_idx
        ON public.chat_messages (room_id)
        WHERE COALESCE(is_hidden_by_admin, false) = false
          AND COALESCE(message_type, 'text') <> 'system'
    $i$;

    EXECUTE $i$
      CREATE INDEX IF NOT EXISTS chat_messages_room_hidden_non_system_idx
        ON public.chat_messages (room_id)
        WHERE COALESCE(is_hidden_by_admin, false) = true
          AND COALESCE(message_type, 'text') <> 'system'
    $i$;
  ELSE
    RAISE NOTICE 'chat_messages_room_admin_indexes: is_hidden_by_admin 또는 message_type 없음 — 부분 인덱스 생략';
  END IF;

  EXECUTE $c$
    COMMENT ON INDEX public.chat_messages_room_id_created_at_desc_idx IS
      '채팅방 메시지 타임라인·before 커서 조회'
  $c$;
END $$;
