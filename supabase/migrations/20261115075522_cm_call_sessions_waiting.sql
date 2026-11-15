-- 대기 통화 표시 열 (docs/audit/call-waiting-stage2-design-2026-11-15.md DB1 · docs/audit/call-waiting-db-stage-plan-2026-11-15.md)
-- 서버가 「받는 사람이 다른 통화에 연결된 중」에 울린 1:1 세션에만 true. 기존 행·기존 경로는 false(동작 변화 없음).
-- PostgreSQL 11+ : 상수 기본값 NOT NULL 열 추가는 표 다시 쓰기 없이 메타데이터만 바뀐다.
ALTER TABLE public.community_messenger_call_sessions
  ADD COLUMN IF NOT EXISTS waiting boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.community_messenger_call_sessions.waiting IS
  '대기 통화(받는 사람이 다른 통화에 연결된 중 울린 1:1 세션). 서버 발신 판정만 true 로 쓴다.';
