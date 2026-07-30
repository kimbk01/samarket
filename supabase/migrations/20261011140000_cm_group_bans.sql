-- Phase 3 S2-1: group ban SSOT (orthogonal to left_at / Phase2 rejoin)

CREATE TABLE IF NOT EXISTS public.community_messenger_group_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.community_messenger_rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  banned_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  banned_at timestamptz NOT NULL DEFAULT now(),
  unbanned_at timestamptz NULL,
  reason text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_messenger_group_bans_one_active_uidx
  ON public.community_messenger_group_bans (room_id, user_id)
  WHERE unbanned_at IS NULL;

CREATE INDEX IF NOT EXISTS community_messenger_group_bans_room_active_idx
  ON public.community_messenger_group_bans (room_id, banned_at DESC)
  WHERE unbanned_at IS NULL;

COMMENT ON TABLE public.community_messenger_group_bans IS
  'Phase3 S2-1: active bans for private_group; orthogonal to participants.left_at.';

ALTER TABLE public.community_messenger_group_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_group_bans_service ON public.community_messenger_group_bans;
CREATE POLICY cm_group_bans_service
  ON public.community_messenger_group_bans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.cm_group_is_user_banned(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_messenger_group_bans b
    WHERE b.room_id = p_room_id
      AND b.user_id = p_user_id
      AND b.unbanned_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.cm_group_is_user_banned(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cm_group_is_user_banned(uuid, uuid) TO service_role;

-- Ban member (sets left_at + active ban row)
CREATE OR REPLACE FUNCTION public.community_messenger_ban_group_member(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room record;
  v_actor record;
  v_target record;
  v_ban public.community_messenger_group_bans%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_room_id IS NULL OR p_actor_user_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_target');
  END IF;
  IF p_actor_user_id = p_target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_target');
  END IF;

  SELECT id, room_type, room_status, owner_user_id, allow_admin_kick
  INTO v_room
  FROM public.community_messenger_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.room_type IS DISTINCT FROM 'private_group' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;
  IF coalesce(v_room.room_status, 'active') IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_unavailable');
  END IF;

  SELECT user_id, role, left_at INTO v_actor
  FROM public.community_messenger_participants
  WHERE room_id = p_room_id AND user_id = p_actor_user_id;

  IF NOT FOUND OR v_actor.left_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_actor.role = 'owner' OR coalesce(v_room.owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_actor_user_id THEN
    NULL; -- owner ok
  ELSIF v_actor.role = 'admin' AND coalesce(v_room.allow_admin_kick, true) THEN
    NULL;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF coalesce(v_room.owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT user_id, role, left_at INTO v_target
  FROM public.community_messenger_participants
  WHERE room_id = p_room_id AND user_id = p_target_user_id
  FOR UPDATE;

  IF FOUND AND v_target.role = 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Admin may only ban members (not other admins), matching kick policy
  IF v_actor.role = 'admin'
     AND coalesce(v_room.owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid) IS DISTINCT FROM p_actor_user_id
     AND FOUND AND v_target.role = 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF public.cm_group_is_user_banned(p_room_id, p_target_user_id) THEN
    RETURN jsonb_build_object('ok', true, 'already_banned', true);
  END IF;

  IF FOUND AND v_target.left_at IS NULL THEN
    UPDATE public.community_messenger_participants
    SET left_at = v_now
    WHERE room_id = p_room_id AND user_id = p_target_user_id AND left_at IS NULL;
  END IF;

  -- Close pending join requests for banned user
  UPDATE public.community_messenger_group_join_requests
  SET status = 'rejected',
      decided_at = v_now,
      decided_by = p_actor_user_id,
      updated_at = v_now
  WHERE room_id = p_room_id
    AND user_id = p_target_user_id
    AND status = 'pending';

  INSERT INTO public.community_messenger_group_bans (
    room_id, user_id, banned_by, banned_at, reason
  )
  VALUES (
    p_room_id,
    p_target_user_id,
    p_actor_user_id,
    v_now,
    NULLIF(trim(coalesce(p_reason, '')), '')
  )
  RETURNING * INTO v_ban;

  RETURN jsonb_build_object(
    'ok', true,
    'ban_id', v_ban.id,
    'room_id', p_room_id,
    'user_id', p_target_user_id,
    'banned_at', v_ban.banned_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_ban_group_member(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_ban_group_member(uuid, uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_ban_group_member(uuid, uuid, uuid, text) TO service_role;

-- Unban (does not auto-rejoin)
CREATE OR REPLACE FUNCTION public.community_messenger_unban_group_member(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room record;
  v_actor record;
  v_ban public.community_messenger_group_bans%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR p_actor_user_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_target');
  END IF;

  SELECT id, room_type, room_status, owner_user_id, allow_admin_kick
  INTO v_room
  FROM public.community_messenger_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.room_type IS DISTINCT FROM 'private_group' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  SELECT user_id, role, left_at INTO v_actor
  FROM public.community_messenger_participants
  WHERE room_id = p_room_id AND user_id = p_actor_user_id;

  IF NOT FOUND OR v_actor.left_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_actor.role = 'owner' OR coalesce(v_room.owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_actor_user_id THEN
    NULL;
  ELSIF v_actor.role = 'admin' AND coalesce(v_room.allow_admin_kick, true) THEN
    NULL;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_ban
  FROM public.community_messenger_group_bans
  WHERE room_id = p_room_id
    AND user_id = p_target_user_id
    AND unbanned_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  UPDATE public.community_messenger_group_bans
  SET unbanned_at = now(), updated_at = now()
  WHERE id = v_ban.id;

  RETURN jsonb_build_object(
    'ok', true,
    'ban_id', v_ban.id,
    'room_id', p_room_id,
    'user_id', p_target_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_unban_group_member(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_unban_group_member(uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_unban_group_member(uuid, uuid, uuid) TO service_role;

-- Harden existing join / request RPCs against active bans
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
  IF public.cm_group_is_user_banned(v_link.room_id, p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_banned');
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
  IF public.cm_group_is_user_banned(v_link.room_id, p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_banned');
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

-- Decide approve must also refuse banned targets
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

  IF public.cm_group_is_user_banned(v_req.room_id, v_req.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_banned');
  END IF;

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
