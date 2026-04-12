-- 거래/통합 채팅·인앱 알림용 테이블을 supabase_realtime publication 에 포함
-- (대시보드에서 수동 추가와 동일 — 마이그레이션으로 재현 가능하게 함)
-- 클라이언트: use-chat-room-realtime(chat_messages, product_chat_messages), useSupabaseNotificationsRealtime(notifications)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'messenger_rt_pub: supabase_realtime publication 없음 — 건너뜀';
    RETURN;
  END IF;

  IF to_regclass('public.chat_messages') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages';
    RAISE NOTICE 'messenger_rt_pub: chat_messages 추가';
  END IF;

  IF to_regclass('public.product_chat_messages') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'product_chat_messages'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.product_chat_messages';
    RAISE NOTICE 'messenger_rt_pub: product_chat_messages 추가';
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
    RAISE NOTICE 'messenger_rt_pub: notifications 추가';
  END IF;
END $$;
