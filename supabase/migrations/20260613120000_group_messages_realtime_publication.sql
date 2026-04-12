-- group_messages 를 Supabase Realtime publication 에 포함 (대시보드에서 수동으로 해도 됨)
-- 이미 포함돼 있으면 건너뜀

DO $$
BEGIN
  IF to_regclass('public.group_messages') IS NULL THEN
    RAISE NOTICE 'group_messages_realtime_publication: group_messages 없음 — 건너뜀';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'group_messages_realtime_publication: supabase_realtime publication 없음 — 건너뜀';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'group_messages'
  ) THEN
    RAISE NOTICE 'group_messages_realtime_publication: 이미 publication 에 포함됨';
    RETURN;
  END IF;

  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages';
END $$;
