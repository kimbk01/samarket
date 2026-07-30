-- Phase 3 S1 Migration 2: join requests + atomic join/decide via invite link

CREATE TABLE IF NOT EXISTS public.community_messenger_group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.community_messenger_rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  invite_link_id uuid NULL REFERENCES public.community_messenger_group_invite_links (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz NULL,
  decided_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_messenger_group_join_requests_one_pending_uidx
  ON public.community_messenger_group_join_requests (room_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS community_messenger_group_join_requests_room_pending_idx
  ON public.community_messenger_group_join_requests (room_id, requested_at DESC)
  WHERE status = 'pending';

COMMENT ON TABLE public.community_messenger_group_join_requests IS
  'Phase3 S1: pending join requests for requires_approval invite links; not participants.';

ALTER TABLE public.community_messenger_group_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_group_join_requests_service ON public.community_messenger_group_join_requests;
CREATE POLICY cm_group_join_requests_service
  ON public.community_messenger_group_join_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Helper: activate or restore member (Phase2 rejoin semantics)
CREATE OR REPLACE FUNCTION public.cm_group_activate_member(
  p_room_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT id, left_at, role INTO v_row
  FROM public.community_messenger_participants
  WHERE room_id = p_room_id AND user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_row.left_at IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'action', 'already_active');
    END IF;
    UPDATE public.community_messenger_participants
    SET left_at = NULL, role = 'member'
    WHERE room_id = p_room_id AND user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'action', 'restored');
  END IF;

  INSERT INTO public.community_messenger_participants (room_id, user_id, role, left_at)
  VALUES (p_room_id, p_user_id, 'member', NULL);

  RETURN jsonb_build_object('ok', true, 'action', 'inserted');
END;
$$;

REVOKE ALL ON FUNCTION public.cm_group_activate_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cm_group_activate_member(uuid, uuid) TO service_role;

-- Join via invite link (requires_approval = false only)
CREATE OR REPLACE FUNCTION public.community_messenger_join_group_via_invite_link(
  p_token text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.community_messenger_group_invite_links%ROWTYPE;
  v_room record;
  v_active record;
  v_act jsonb;
BEGIN
  IF coalesce(trim(p_token), '') = '' OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'content_required');
  END IF;

  SELECT * INTO v_link
  FROM public.community_messenger_group_invite_links
  WHERE token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_expired');
  END IF;
  IF v_link.usage_limit IS NOT NULL AND v_link.usage_count >= v_link.usage_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_usage_exceeded');
  END IF;
  IF v_link.requires_approval THEN
    RETURN jsonb_build_object('ok', false, 'error', 'approval_required');
  END IF;

  SELECT id, room_type, room_status, title, summary, avatar_url
  INTO v_room
  FROM public.community_messenger_rooms
  WHERE id = v_link.room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.room_type IS DISTINCT FROM 'private_group'
     OR coalesce(v_room.room_status, 'active') IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  SELECT user_id, left_at INTO v_active
  FROM public.community_messenger_participants
  WHERE room_id = v_link.room_id AND user_id = p_user_id;

  IF FOUND AND v_active.left_at IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'room_id', v_link.room_id, 'already_member', true);
  END IF;

  -- Atomic usage slot
  UPDATE public.community_messenger_group_invite_links
  SET usage_count = usage_count + 1, updated_at = now()
  WHERE id = v_link.id
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
    AND (usage_limit IS NULL OR usage_count < usage_limit)
  RETURNING * INTO v_link;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_usage_exceeded');
  END IF;

  v_act := public.cm_group_activate_member(v_link.room_id, p_user_id);

  -- Close any pending join request for this user
  UPDATE public.community_messenger_group_join_requests
  SET status = 'approved',
      decided_at = now(),
      decided_by = p_user_id,
      updated_at = now()
  WHERE room_id = v_link.room_id
    AND user_id = p_user_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'room_id', v_link.room_id,
    'link_id', v_link.id,
    'activate', v_act
  );
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_join_group_via_invite_link(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_join_group_via_invite_link(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_join_group_via_invite_link(text, uuid) TO service_role;

-- Request join (requires_approval = true)
CREATE OR REPLACE FUNCTION public.community_messenger_request_group_join(
  p_token text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.community_messenger_group_invite_links%ROWTYPE;
  v_room record;
  v_active record;
  v_pending public.community_messenger_group_join_requests%ROWTYPE;
BEGIN
  IF coalesce(trim(p_token), '') = '' OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'content_required');
  END IF;

  SELECT * INTO v_link
  FROM public.community_messenger_group_invite_links
  WHERE token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_expired');
  END IF;
  IF v_link.usage_limit IS NOT NULL AND v_link.usage_count >= v_link.usage_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_usage_exceeded');
  END IF;
  IF NOT v_link.requires_approval THEN
    RETURN jsonb_build_object('ok', false, 'error', 'approval_not_required');
  END IF;

  SELECT id, room_type, room_status INTO v_room
  FROM public.community_messenger_rooms
  WHERE id = v_link.room_id;

  IF NOT FOUND OR v_room.room_type IS DISTINCT FROM 'private_group'
     OR coalesce(v_room.room_status, 'active') IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  SELECT user_id, left_at INTO v_active
  FROM public.community_messenger_participants
  WHERE room_id = v_link.room_id AND user_id = p_user_id;

  IF FOUND AND v_active.left_at IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'room_id', v_link.room_id, 'already_member', true);
  END IF;

  SELECT * INTO v_pending
  FROM public.community_messenger_group_join_requests
  WHERE room_id = v_link.room_id AND user_id = p_user_id AND status = 'pending';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'room_id', v_link.room_id,
      'request_id', v_pending.id,
      'status', 'pending',
      'existing', true
    );
  END IF;

  INSERT INTO public.community_messenger_group_join_requests (
    room_id, user_id, invite_link_id, status
  )
  VALUES (v_link.room_id, p_user_id, v_link.id, 'pending')
  RETURNING * INTO v_pending;

  RETURN jsonb_build_object(
    'ok', true,
    'room_id', v_link.room_id,
    'request_id', v_pending.id,
    'status', 'pending',
    'existing', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_request_group_join(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_request_group_join(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_request_group_join(text, uuid) TO service_role;

-- Cancel own pending request
CREATE OR REPLACE FUNCTION public.community_messenger_cancel_group_join_request(
  p_room_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.community_messenger_group_join_requests%ROWTYPE;
BEGIN
  UPDATE public.community_messenger_group_join_requests
  SET status = 'cancelled', decided_at = now(), decided_by = p_user_id, updated_at = now()
  WHERE room_id = p_room_id
    AND user_id = p_user_id
    AND status = 'pending'
  RETURNING * INTO v_req;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;
  RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_cancel_group_join_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_cancel_group_join_request(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_cancel_group_join_request(uuid, uuid) TO service_role;

-- Decide join request (approve | reject)
CREATE OR REPLACE FUNCTION public.community_messenger_decide_group_join_request(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.community_messenger_group_join_requests%ROWTYPE;
  v_link public.community_messenger_group_invite_links%ROWTYPE;
  v_me record;
  v_act jsonb;
  v_decision text := lower(trim(coalesce(p_decision, '')));
BEGIN
  IF v_decision NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'content_required');
  END IF;

  SELECT * INTO v_req
  FROM public.community_messenger_group_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;
  IF v_req.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_already_decided', 'status', v_req.status);
  END IF;

  SELECT user_id, role, left_at INTO v_me
  FROM public.community_messenger_participants
  WHERE room_id = v_req.room_id AND user_id = p_actor_user_id;

  IF NOT FOUND OR v_me.left_at IS NOT NULL OR v_me.role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_decision = 'rejected' THEN
    UPDATE public.community_messenger_group_join_requests
    SET status = 'rejected', decided_at = now(), decided_by = p_actor_user_id, updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true, 'status', 'rejected', 'room_id', v_req.room_id);
  END IF;

  -- Approve: optional usage bump if link still valid
  IF v_req.invite_link_id IS NOT NULL THEN
    SELECT * INTO v_link
    FROM public.community_messenger_group_invite_links
    WHERE id = v_req.invite_link_id
    FOR UPDATE;

    IF FOUND AND v_link.revoked_at IS NULL
       AND (v_link.expires_at IS NULL OR v_link.expires_at > now())
       AND (v_link.usage_limit IS NULL OR v_link.usage_count < v_link.usage_limit) THEN
      UPDATE public.community_messenger_group_invite_links
      SET usage_count = usage_count + 1, updated_at = now()
      WHERE id = v_link.id
        AND (usage_limit IS NULL OR usage_count < usage_limit);
    END IF;
  END IF;

  v_act := public.cm_group_activate_member(v_req.room_id, v_req.user_id);

  UPDATE public.community_messenger_group_join_requests
  SET status = 'approved', decided_at = now(), decided_by = p_actor_user_id, updated_at = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_already_decided');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'approved',
    'room_id', v_req.room_id,
    'user_id', v_req.user_id,
    'activate', v_act
  );
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_decide_group_join_request(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_decide_group_join_request(uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_decide_group_join_request(uuid, uuid, text) TO service_role;

-- Close pending when admin direct-adds
CREATE OR REPLACE FUNCTION public.community_messenger_close_pending_join_on_direct_add(
  p_room_id uuid,
  p_user_ids uuid[],
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.community_messenger_group_join_requests
  SET status = 'approved',
      decided_at = now(),
      decided_by = p_actor_user_id,
      updated_at = now()
  WHERE room_id = p_room_id
    AND user_id = ANY (p_user_ids)
    AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'closed', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_close_pending_join_on_direct_add(uuid, uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_close_pending_join_on_direct_add(uuid, uuid[], uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_close_pending_join_on_direct_add(uuid, uuid[], uuid) TO service_role;
