-- WP-8 / NEW-18/26 — call_logs 종료 필드 저장.
--
-- FIRST DIVERGENCE: createCommunityMessengerCallLog 가 ended_at/answered_at/ended_reason 을
-- 입력으로 받지만 insert payload 에서 누락 → 전 행(6,544)의 ended_at 이 NULL.
-- ended_at 컬럼은 이미 있으나 저장되지 않았고, answered_at/ended_reason 컬럼은 없다.
--
-- 이 마이그레이션은 스키마만(널 허용 컬럼 추가 = 가역). 기존 행 backfill 은 별도 DATA GATE
-- (Owner 승인·dry-run) 로 분리한다 — 여기서는 대량 UPDATE 하지 않는다.

ALTER TABLE public.community_messenger_call_logs
  ADD COLUMN IF NOT EXISTS answered_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ended_reason text NULL;

COMMENT ON COLUMN public.community_messenger_call_logs.answered_at IS
  'WP-8 NEW-18/26: terminal answered_at (writer 가 채움; 미응답은 NULL).';
COMMENT ON COLUMN public.community_messenger_call_logs.ended_reason IS
  'WP-8 NEW-18/26: terminal ended_reason (writer 가 채움).';
