-- 커뮤니티 메신저 Realtime 구독 테이블을 supabase_realtime publication 에 일괄 추가
-- (community_messenger_core·identity_profiles 이후 적용)
-- 클라이언트: use-community-messenger-realtime.ts, GlobalCommunityMessengerIncomingCall.tsx

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'community_messenger_rooms',
    'community_messenger_participants',
    'community_messenger_messages',
    'community_messenger_room_profiles',
    'community_friend_requests',
    'community_friend_favorites',
    'community_messenger_call_logs',
    'community_messenger_call_sessions',
    'community_messenger_call_session_participants',
    'user_relationships'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'cm_realtime_pub: supabase_realtime publication 없음 — 건너뜀';
    RETURN;
  END IF;

  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'cm_realtime_pub: 테이블 없음 — 건너뜀 %', t;
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    RAISE NOTICE 'cm_realtime_pub: public.% 추가', t;
  END LOOP;
END $$;
