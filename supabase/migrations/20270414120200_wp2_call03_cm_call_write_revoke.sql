-- WP-2 / CALL-03 — 통화 테이블 서버 전용 쓰기
-- 재감사(2026-10-02, prod): call_sessions·call_logs·call_session_participants FOR ALL {public},
--   call_events·call_signals INSERT {public} + 쓰기 권한 개방(CALL-03).
-- 안전성: 통화 로그/세션/시그널 쓰기는 전부 service_role(통화 API) 경로, 브라우저 직접 쓰기 0건.
--   authenticated SELECT 유지 → 통화기록 조회 불변.
BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  public.community_messenger_call_sessions,
  public.community_messenger_call_logs,
  public.community_messenger_call_session_participants,
  public.community_messenger_call_events,
  public.community_messenger_call_signals
  FROM anon, authenticated;
COMMIT;
