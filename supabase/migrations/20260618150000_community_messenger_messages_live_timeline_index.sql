-- 타임라인: 삭제되지 않은 메시지만 `room_id + 최신순` 조회 (스냅샷·페이지네이션)
-- 기존 `community_messenger_messages_room_created_at_id_desc_keyset_idx` 는 전체 행 기준이므로,
-- `deleted_at is null` 필터와 함께 쓰일 때 planner 가 고르게 택할 수 있도록 부분 인덱스 추가

DO $$
BEGIN
  IF to_regclass('public.community_messenger_messages') IS NOT NULL THEN
    EXECUTE $i$
      CREATE INDEX IF NOT EXISTS community_messenger_messages_room_created_live_idx
        ON public.community_messenger_messages (room_id, created_at DESC NULLS LAST, id DESC NULLS LAST)
        WHERE deleted_at IS NULL
    $i$;
  END IF;
END $$;
