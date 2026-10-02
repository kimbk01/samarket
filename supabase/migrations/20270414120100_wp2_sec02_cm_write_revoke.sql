-- WP-2 / SEC-02 — 메신저 쓰기 잠금 (presence_snapshots 제외)
-- 재감사(2026-10-02, prod): messages·rooms·room_profiles·peer_notices FOR ALL {public},
--   friendships·reactions·requests·hides·reports·notification_events·user_devices 쓰기 개방(SEC-02).
-- 안전성: community_messenger_* / notification_events / user_devices 쓰기는 전부 service_role 경로,
--   브라우저(anon) 직접 쓰기 0건. SELECT 권한/정책 전부 유지.
--   presence_snapshots 만 예외 — authenticated 클라이언트가 자기 presence 직접 기록
--   (정책 presence_snapshots_insert_own/_update_own TO authenticated) → authenticated 유지, anon 만 회수.
BEGIN;
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname='public'
      AND tablename LIKE 'community_messenger%'
      AND tablename NOT LIKE 'community_messenger_call%'
      AND tablename NOT IN ('community_messenger_participants','community_messenger_presence_snapshots')
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.notification_events, public.user_devices FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.community_messenger_presence_snapshots FROM anon;
COMMIT;
