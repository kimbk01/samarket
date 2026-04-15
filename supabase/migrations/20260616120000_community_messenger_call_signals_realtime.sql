-- WebRTC 시그널 행 INSERT 가 클라이언트에 실시간 전달되도록 publication 에 포함
-- (기존 20260605140000 에는 call_sessions 만 있고 call_signals 는 누락되어 폴링에만 의존)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'cm_call_signals_rt: supabase_realtime 없음 — 건너뜀';
    RETURN;
  END IF;
  IF to_regclass('public.community_messenger_call_signals') IS NULL THEN
    RAISE NOTICE 'cm_call_signals_rt: 테이블 없음 — 건너뜀';
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'community_messenger_call_signals'
  ) THEN
    RETURN;
  END IF;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messenger_call_signals;
  RAISE NOTICE 'cm_call_signals_rt: community_messenger_call_signals 추가됨';
END $$;
