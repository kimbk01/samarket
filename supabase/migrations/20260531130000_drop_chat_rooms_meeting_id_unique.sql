-- 모임당 chat_rooms 1개만 허용하던 유니크 인덱스가 남아 있으면
-- 메인 방 생성 후 서브 방 INSERT 또는 고아 방 재연결 시 duplicate key 로 실패할 수 있음.
-- 20260331160000_meeting_chat_private_rls.sql 과 동일 조치(미적용 환경용 재발행).
DROP INDEX IF EXISTS public.chat_rooms_meeting_id_unique;
