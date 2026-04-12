-- 통합 거래 채팅: 키셋 페이지네이션 (room_id, created_at DESC, id DESC) 에 맞춘 단일 타임라인 인덱스
-- 기존 (room_id, created_at DESC) 만 있던 인덱스는 동일 접두 컬럼으로 대체되어 중복 쓰기 부담을 줄임.
-- 대용량 테이블에서는 배포 전 스테이징에서 LOCK/시간을 확인할 것.

DO $$
BEGIN
  IF to_regclass('public.chat_messages') IS NULL THEN
    RAISE NOTICE 'chat_messages_keyset_timeline_index: chat_messages 없음 — 건너뜀';
    RETURN;
  END IF;

  EXECUTE $i$
    CREATE INDEX IF NOT EXISTS chat_messages_room_created_at_id_desc_keyset_idx
      ON public.chat_messages (room_id, created_at DESC NULLS LAST, id DESC NULLS LAST)
  $i$;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'chat_messages_room_id_created_at_desc_idx'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS public.chat_messages_room_id_created_at_desc_idx';
  END IF;

  EXECUTE $c$
    COMMENT ON INDEX public.chat_messages_room_created_at_id_desc_keyset_idx IS
      '거래 채팅 타임라인·(created_at,id) 키셋 before 조회'
  $c$;
END $$;
