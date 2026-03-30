-- 클라이언트(authenticated)가 Supabase에 직접 붙어 chat_messages 를 조회할 때:
-- 해당 방의 활성 chat_room_participants 행이 있는 사용자만 SELECT 허용.
-- 서버 API(service_role)·관리자 경로는 RLS 를 우회합니다.

DO $$
DECLARE
  has_left_at boolean;
  using_clause text;
BEGIN
  IF to_regclass('public.chat_messages') IS NULL OR to_regclass('public.chat_room_participants') IS NULL THEN
    RAISE NOTICE 'chat_messages_participant_select_rls: chat_messages 또는 chat_room_participants 없음 — 건너뜀';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_room_participants'
      AND column_name = 'left_at'
  ) INTO has_left_at;

  using_clause :=
    'EXISTS (
      SELECT 1
      FROM public.chat_room_participants p
      WHERE p.room_id = chat_messages.room_id
        AND p.user_id = auth.uid()
        AND COALESCE(p.hidden, false) = false
        AND COALESCE(p.is_active, true) = true';

  IF has_left_at THEN
    using_clause := using_clause || ' AND p.left_at IS NULL';
  END IF;

  using_clause := using_clause || ')';

  EXECUTE 'ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS chat_messages_select_room_participant ON public.chat_messages';

  EXECUTE format(
    'CREATE POLICY chat_messages_select_room_participant ON public.chat_messages
      FOR SELECT TO authenticated USING (%s)',
    using_clause
  );

  EXECUTE 'COMMENT ON POLICY chat_messages_select_room_participant ON public.chat_messages IS '
    || quote_literal('방 참가자(활성·미숨김)만 메시지 SELECT — 직접 클라이언트 조회용');
END $$;
