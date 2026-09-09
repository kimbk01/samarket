-- CUT-R1: break RLS infinite recursion between call_sessions ↔ call_session_participants
-- Root cause (prod 2026-09-10): authenticated SELECT → 42P17 → Realtime postgres_changes absent
-- Pattern: same as 20261002120000 cm_is_room_participant (SECURITY DEFINER + fixed search_path)
-- Semantics: preserve 20260605004000 membership contract (no permissive open policy; RLS stays enabled)

CREATE OR REPLACE FUNCTION public.cm_is_call_session_participant(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_messenger_call_session_participants p
    WHERE p.session_id = p_session_id
      AND p.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.cm_is_call_session_participant(uuid) IS
  'CUT-R1: non-recursive call_session_participants membership check for RLS (SECURITY DEFINER).';

CREATE OR REPLACE FUNCTION public.cm_is_call_session_initiator(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_messenger_call_sessions s
    WHERE s.id = p_session_id
      AND s.initiator_user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.cm_is_call_session_initiator(uuid) IS
  'CUT-R1: non-recursive call_sessions initiator check for RLS (SECURITY DEFINER).';

REVOKE ALL ON FUNCTION public.cm_is_call_session_participant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cm_is_call_session_initiator(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_is_call_session_participant(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cm_is_call_session_initiator(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cm_is_call_session_participant(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cm_is_call_session_initiator(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS community_messenger_call_sessions_member_policy
  ON public.community_messenger_call_sessions;
CREATE POLICY community_messenger_call_sessions_member_policy
  ON public.community_messenger_call_sessions
  FOR ALL
  USING (
    auth.uid() = initiator_user_id
    OR auth.uid() = recipient_user_id
    OR public.cm_is_call_session_participant(id)
  )
  WITH CHECK (
    auth.uid() = initiator_user_id
    OR auth.uid() = recipient_user_id
    OR public.cm_is_call_session_participant(id)
  );

DROP POLICY IF EXISTS community_messenger_call_session_participants_member_policy
  ON public.community_messenger_call_session_participants;
CREATE POLICY community_messenger_call_session_participants_member_policy
  ON public.community_messenger_call_session_participants
  FOR ALL
  USING (
    auth.uid() = user_id
    OR public.cm_is_call_session_initiator(session_id)
    OR public.cm_is_call_session_participant(session_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.cm_is_call_session_initiator(session_id)
    OR public.cm_is_call_session_participant(session_id)
  );
