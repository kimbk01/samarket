-- community_posts 삭제 → meetings CASCADE 삭제 시
-- chat_rooms.meeting_id 가 NO ACTION 이면 FK 위반 발생
-- (예: /admin/posts 커뮤니티 글 일괄 삭제)

ALTER TABLE public.chat_rooms DROP CONSTRAINT IF EXISTS chat_rooms_meeting_id_fkey;

ALTER TABLE public.chat_rooms
  ADD CONSTRAINT chat_rooms_meeting_id_fkey
  FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT chat_rooms_meeting_id_fkey ON public.chat_rooms IS
  '모임 글(post) 삭제 시 meeting 행이 지워지면 meeting_id 를 비움 (채팅방 행은 거래/메시지 보관용으로 남을 수 있음)';
