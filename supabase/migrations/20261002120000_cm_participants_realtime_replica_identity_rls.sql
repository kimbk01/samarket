-- community_messenger_participants Realtime 전달 고정
-- (2026-07-23 prod 실측: DEFAULT replica identity → UPDATE 이벤트 0건;
--  SELECT/mutate RLS 가 participants 자기참조 → infinite recursion → 로그인 유저 RT 0건)
-- prod 에 이미 적용된 SQL 을 레포에 idempotent 로 고정. 재적용 안전.

ALTER TABLE public.community_messenger_participants
  REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.cm_is_room_participant(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_messenger_participants p
    WHERE p.room_id = p_room_id
      AND p.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.cm_is_room_admin(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_messenger_participants p
    WHERE p.room_id = p_room_id
      AND p.user_id = auth.uid()
      AND p.role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.cm_is_room_participant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cm_is_room_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cm_is_room_participant(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cm_is_room_admin(uuid) TO authenticated, anon;

DROP POLICY IF EXISTS community_messenger_participants_select_self_policy
  ON public.community_messenger_participants;
DROP POLICY IF EXISTS community_messenger_participants_mutate_member_policy
  ON public.community_messenger_participants;
DROP POLICY IF EXISTS community_messenger_participants_insert_member_policy
  ON public.community_messenger_participants;
DROP POLICY IF EXISTS community_messenger_participants_update_member_policy
  ON public.community_messenger_participants;
DROP POLICY IF EXISTS community_messenger_participants_delete_member_policy
  ON public.community_messenger_participants;

CREATE POLICY community_messenger_participants_select_self_policy
  ON public.community_messenger_participants
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.cm_is_room_participant(room_id)
  );

CREATE POLICY community_messenger_participants_insert_member_policy
  ON public.community_messenger_participants
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR public.cm_is_room_admin(room_id)
  );

CREATE POLICY community_messenger_participants_update_member_policy
  ON public.community_messenger_participants
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.cm_is_room_admin(room_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.cm_is_room_admin(room_id)
  );

CREATE POLICY community_messenger_participants_delete_member_policy
  ON public.community_messenger_participants
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR public.cm_is_room_admin(room_id)
  );
