-- meeting_open_chat_bans: 인덱스가 존재하지 않는 created_at 을 참조하던 오류 수정
DROP INDEX IF EXISTS public.meeting_open_chat_bans_room_idx;

CREATE INDEX IF NOT EXISTS meeting_open_chat_bans_room_idx
  ON public.meeting_open_chat_bans (room_id, banned_at DESC);
