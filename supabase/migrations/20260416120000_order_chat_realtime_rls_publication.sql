-- 주문 전용 채팅: Supabase Realtime + authenticated SELECT (클라 `useOrderChatRoomRealtime`)
-- 서비스 롤 API는 기존대로 RLS 를 우회한다.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'order_chat_rt: supabase_realtime publication 없음 — 건너뜀';
    RETURN;
  END IF;

  IF to_regclass('public.order_chat_messages') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_chat_messages'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.order_chat_messages';
    RAISE NOTICE 'order_chat_rt: order_chat_messages publication 추가';
  END IF;

  IF to_regclass('public.order_chat_rooms') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_chat_rooms'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.order_chat_rooms';
    RAISE NOTICE 'order_chat_rt: order_chat_rooms publication 추가';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.order_chat_rooms') IS NULL OR to_regclass('public.order_chat_messages') IS NULL THEN
    RAISE NOTICE 'order_chat_rls: order_chat 테이블 없음 — 건너뜀';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.order_chat_rooms ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.order_chat_messages ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS order_chat_rooms_select_participant_v1 ON public.order_chat_rooms';
  EXECUTE $pol$
    CREATE POLICY order_chat_rooms_select_participant_v1 ON public.order_chat_rooms
    FOR SELECT TO authenticated
    USING (buyer_user_id = (select auth.uid()) OR owner_user_id = (select auth.uid()))
  $pol$;

  EXECUTE 'DROP POLICY IF EXISTS order_chat_messages_select_participant_v1 ON public.order_chat_messages';
  EXECUTE $pol$
    CREATE POLICY order_chat_messages_select_participant_v1 ON public.order_chat_messages
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.order_chat_rooms r
        WHERE r.id = order_chat_messages.room_id
          AND (r.buyer_user_id = (select auth.uid()) OR r.owner_user_id = (select auth.uid()))
      )
    )
  $pol$;
END $$;
