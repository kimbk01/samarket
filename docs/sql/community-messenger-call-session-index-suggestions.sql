-- 제안 전용 (마이그레이션에 바로 넣지 말고 EXPLAIN/부하 확인 후 적용)
-- 테이블명: public.community_messenger_call_sessions

-- 발신/활성 세션 조회·중복 방지에 자주 쓰이는 (room_id, status) 필터
CREATE INDEX IF NOT EXISTS idx_community_messenger_call_sessions_room_status
  ON public.community_messenger_call_sessions (room_id, status);

-- initiator 기준 최근 통화·부하 추적(선택)
CREATE INDEX IF NOT EXISTS idx_community_messenger_call_sessions_initiator
  ON public.community_messenger_call_sessions (initiator_user_id);
