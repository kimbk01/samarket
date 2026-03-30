-- Step D: 다중 모임 채팅 + 비공개 메타 보호
-- 1) meeting_id 당 chat_rooms 1개만 허용하던 유니크 인덱스 제거 (부가 방 INSERT 허용)
-- 2) meeting_chat_rooms / meeting_chat_participants RLS (클라이언트 직접 조회 시)
--    서버 API(service_role)는 RLS를 우회합니다.

-- ---------- 1) 유니크 인덱스 제거 ----------
DROP INDEX IF EXISTS public.chat_rooms_meeting_id_unique;

-- ---------- 2) RLS ----------
ALTER TABLE public.meeting_chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_chat_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_chat_rooms_select_eligible ON public.meeting_chat_rooms;
CREATE POLICY meeting_chat_rooms_select_eligible ON public.meeting_chat_rooms
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meeting_chat_participants p
      WHERE p.room_id = meeting_chat_rooms.id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.meetings m
      WHERE m.id = meeting_chat_rooms.meeting_id
        AND (m.host_user_id = auth.uid() OR m.created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.meeting_members mm
      WHERE mm.meeting_id = meeting_chat_rooms.meeting_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'joined'
        AND mm.role = 'co_host'
    )
  );

DROP POLICY IF EXISTS meeting_chat_participants_select_eligible ON public.meeting_chat_participants;
CREATE POLICY meeting_chat_participants_select_eligible ON public.meeting_chat_participants
  FOR SELECT
  TO authenticated
  USING (
    meeting_chat_participants.user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.meeting_chat_rooms r
      JOIN public.meetings m ON m.id = r.meeting_id
      WHERE r.id = meeting_chat_participants.room_id
        AND (m.host_user_id = auth.uid() OR m.created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.meeting_chat_rooms r
      JOIN public.meeting_members mm
        ON mm.meeting_id = r.meeting_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'joined'
        AND mm.role = 'co_host'
      WHERE r.id = meeting_chat_participants.room_id
    )
  );

COMMENT ON POLICY meeting_chat_rooms_select_eligible ON public.meeting_chat_rooms IS
  '비공개/서브 방 메타: 참가자·모임장·공동운영자만 SELECT (직접 Supabase 클라이언트용)';
COMMENT ON POLICY meeting_chat_participants_select_eligible ON public.meeting_chat_participants IS
  '본인 행 또는 해당 모임 운영자만 타인 참가 행 조회';
