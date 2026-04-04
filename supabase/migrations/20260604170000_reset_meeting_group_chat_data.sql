BEGIN;

-- 개발 단계 재구축: 기존 커뮤니티 모임 채팅 데이터를 전량 비운다.
-- 스키마는 유지하고 데이터만 초기화해, 새 group-chat 표면이 빈 상태에서 다시 시작되게 한다.
TRUNCATE TABLE
  public.meeting_open_chat_logs,
  public.meeting_open_chat_notices,
  public.meeting_open_chat_bans,
  public.meeting_open_chat_reports,
  public.meeting_open_chat_join_requests,
  public.meeting_open_chat_attachments,
  public.meeting_open_chat_messages,
  public.meeting_open_chat_members,
  public.meeting_open_chat_rooms
RESTART IDENTITY CASCADE;

COMMIT;
