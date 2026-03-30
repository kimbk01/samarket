-- 모임 다중 채팅 메타 (실제 메시지는 기존 chat_rooms / chat_messages)
-- main 방은 meetings.chat_room_id 로만 두고, 여기에는 sub / private 만 저장합니다.

CREATE TABLE IF NOT EXISTS public.meeting_chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  room_type text NOT NULL CHECK (room_type IN ('sub', 'private')),
  is_private boolean NOT NULL DEFAULT false,
  linked_chat_room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_chat_rooms_private_consistency CHECK (
    (room_type = 'private' AND is_private = true)
    OR (room_type = 'sub' AND is_private = false)
  )
);

CREATE INDEX IF NOT EXISTS meeting_chat_rooms_meeting_id_idx
  ON public.meeting_chat_rooms (meeting_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.meeting_chat_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.meeting_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS meeting_chat_participants_room_idx
  ON public.meeting_chat_participants (room_id);
CREATE INDEX IF NOT EXISTS meeting_chat_participants_user_idx
  ON public.meeting_chat_participants (user_id);

COMMENT ON TABLE public.meeting_chat_rooms IS '모임 부가 채팅(sub/private). 기본 전체 채팅은 meetings.chat_room_id';
COMMENT ON TABLE public.meeting_chat_participants IS '부가 채팅방 접근자(초대/선택 멤버). chat_room_participants 와 함께 유지';
