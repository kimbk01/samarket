-- Realtime publication for community_messenger_friendships

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'cm_friendships_rt: supabase_realtime publication 없음 — 건너뜀';
    RETURN;
  END IF;
  IF to_regclass('public.community_messenger_friendships') IS NULL THEN
    RAISE NOTICE 'cm_friendships_rt: 테이블 없음 — 건너뜀';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'community_messenger_friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messenger_friendships;
    RAISE NOTICE 'cm_friendships_rt: community_messenger_friendships 추가';
  END IF;
END $$;
