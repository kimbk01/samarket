-- Phase 3 S1 Migration 1: multi invite links (Telegram-style)
-- Authority: community_messenger_group_invite_links
-- Compat: community_messenger_rooms.invite_token / invite_link_enabled mirrored for default link

CREATE TABLE IF NOT EXISTS public.community_messenger_group_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.community_messenger_rooms (id) ON DELETE CASCADE,
  token text NOT NULL,
  name text NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  usage_limit integer NULL CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  requires_approval boolean NOT NULL DEFAULT false,
  revoked_at timestamptz NULL,
  is_default boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_messenger_group_invite_links_token_uidx
  ON public.community_messenger_group_invite_links (token);

CREATE INDEX IF NOT EXISTS community_messenger_group_invite_links_room_idx
  ON public.community_messenger_group_invite_links (room_id)
  WHERE revoked_at IS NULL;

-- At most one active default link per room
CREATE UNIQUE INDEX IF NOT EXISTS community_messenger_group_invite_links_one_default_uidx
  ON public.community_messenger_group_invite_links (room_id)
  WHERE is_default = true AND revoked_at IS NULL;

COMMENT ON TABLE public.community_messenger_group_invite_links IS
  'Phase3 S1: private_group invite links; requires_approval is per-link.';

-- Backfill from room.invite_token
INSERT INTO public.community_messenger_group_invite_links (
  room_id, token, name, created_by, requires_approval, is_default, revoked_at, usage_count
)
SELECT
  r.id,
  r.invite_token,
  NULL,
  r.owner_user_id,
  false,
  true,
  CASE WHEN r.invite_link_enabled = false THEN now() ELSE NULL END,
  0
FROM public.community_messenger_rooms r
WHERE r.room_type = 'private_group'
  AND r.invite_token IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.community_messenger_group_invite_links l
    WHERE l.token = r.invite_token
  );

-- Mirror helpers: keep room.invite_token in sync with active default link
CREATE OR REPLACE FUNCTION public.cm_sync_room_default_invite_token(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_enabled boolean;
BEGIN
  SELECT token, (revoked_at IS NULL)
  INTO v_token, v_enabled
  FROM public.community_messenger_group_invite_links
  WHERE room_id = p_room_id
    AND is_default = true
    AND revoked_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NULL THEN
    UPDATE public.community_messenger_rooms
    SET invite_token = NULL,
        invite_link_enabled = false,
        updated_at = now()
    WHERE id = p_room_id;
  ELSE
    UPDATE public.community_messenger_rooms
    SET invite_token = v_token,
        invite_link_enabled = true,
        updated_at = now()
    WHERE id = p_room_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cm_sync_room_default_invite_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cm_sync_room_default_invite_token(uuid) TO service_role;

-- Create invite link (service_role)
CREATE OR REPLACE FUNCTION public.community_messenger_create_group_invite_link(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_token text,
  p_name text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_usage_limit integer DEFAULT NULL,
  p_requires_approval boolean DEFAULT false,
  p_is_default boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room record;
  v_me record;
  v_link public.community_messenger_group_invite_links%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR p_actor_user_id IS NULL OR coalesce(trim(p_token), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'content_required');
  END IF;

  SELECT id, room_type, room_status
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

  SELECT user_id, role, left_at
  INTO v_me
  FROM public.community_messenger_participants
  WHERE room_id = p_room_id AND user_id = p_actor_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_me.left_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_me.role NOT IN ('owner', 'admin', 'member') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_is_default THEN
    UPDATE public.community_messenger_group_invite_links
    SET is_default = false, updated_at = now()
    WHERE room_id = p_room_id AND is_default = true AND revoked_at IS NULL;
  END IF;

  INSERT INTO public.community_messenger_group_invite_links (
    room_id, token, name, created_by, expires_at, usage_limit,
    requires_approval, is_default
  )
  VALUES (
    p_room_id,
    trim(p_token),
    NULLIF(trim(coalesce(p_name, '')), ''),
    p_actor_user_id,
    p_expires_at,
    p_usage_limit,
    coalesce(p_requires_approval, false),
    coalesce(p_is_default, false)
  )
  RETURNING * INTO v_link;

  IF v_link.is_default THEN
    PERFORM public.cm_sync_room_default_invite_token(p_room_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'link', jsonb_build_object(
      'id', v_link.id,
      'room_id', v_link.room_id,
      'token', v_link.token,
      'name', v_link.name,
      'created_by', v_link.created_by,
      'created_at', v_link.created_at,
      'expires_at', v_link.expires_at,
      'usage_limit', v_link.usage_limit,
      'usage_count', v_link.usage_count,
      'requires_approval', v_link.requires_approval,
      'revoked_at', v_link.revoked_at,
      'is_default', v_link.is_default
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_create_group_invite_link(uuid, uuid, text, text, timestamptz, integer, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_create_group_invite_link(uuid, uuid, text, text, timestamptz, integer, boolean, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_create_group_invite_link(uuid, uuid, text, text, timestamptz, integer, boolean, boolean) TO service_role;

-- Update link metadata (token immutable)
CREATE OR REPLACE FUNCTION public.community_messenger_update_group_invite_link(
  p_link_id uuid,
  p_actor_user_id uuid,
  p_name text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_clear_expires boolean DEFAULT false,
  p_usage_limit integer DEFAULT NULL,
  p_clear_usage_limit boolean DEFAULT false,
  p_requires_approval boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.community_messenger_group_invite_links%ROWTYPE;
  v_me record;
BEGIN
  SELECT * INTO v_link
  FROM public.community_messenger_group_invite_links
  WHERE id = p_link_id
  FOR UPDATE;

  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  SELECT user_id, role, left_at INTO v_me
  FROM public.community_messenger_participants
  WHERE room_id = v_link.room_id AND user_id = p_actor_user_id;

  IF NOT FOUND OR v_me.left_at IS NOT NULL OR v_me.role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.community_messenger_group_invite_links
  SET
    name = CASE WHEN p_name IS NULL THEN name ELSE NULLIF(trim(p_name), '') END,
    expires_at = CASE
      WHEN p_clear_expires THEN NULL
      WHEN p_expires_at IS NOT NULL THEN p_expires_at
      ELSE expires_at
    END,
    usage_limit = CASE
      WHEN p_clear_usage_limit THEN NULL
      WHEN p_usage_limit IS NOT NULL THEN p_usage_limit
      ELSE usage_limit
    END,
    requires_approval = coalesce(p_requires_approval, requires_approval),
    updated_at = now()
  WHERE id = p_link_id
  RETURNING * INTO v_link;

  RETURN jsonb_build_object(
    'ok', true,
    'link', jsonb_build_object(
      'id', v_link.id,
      'room_id', v_link.room_id,
      'token', v_link.token,
      'name', v_link.name,
      'expires_at', v_link.expires_at,
      'usage_limit', v_link.usage_limit,
      'usage_count', v_link.usage_count,
      'requires_approval', v_link.requires_approval,
      'revoked_at', v_link.revoked_at,
      'is_default', v_link.is_default
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_update_group_invite_link(uuid, uuid, text, timestamptz, boolean, integer, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_update_group_invite_link(uuid, uuid, text, timestamptz, boolean, integer, boolean, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_update_group_invite_link(uuid, uuid, text, timestamptz, boolean, integer, boolean, boolean) TO service_role;

-- Revoke link
CREATE OR REPLACE FUNCTION public.community_messenger_revoke_group_invite_link(
  p_link_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.community_messenger_group_invite_links%ROWTYPE;
  v_me record;
BEGIN
  SELECT * INTO v_link
  FROM public.community_messenger_group_invite_links
  WHERE id = p_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;
  IF v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_revoked', true);
  END IF;

  SELECT user_id, role, left_at INTO v_me
  FROM public.community_messenger_participants
  WHERE room_id = v_link.room_id AND user_id = p_actor_user_id;

  IF NOT FOUND OR v_me.left_at IS NOT NULL OR v_me.role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.community_messenger_group_invite_links
  SET revoked_at = now(), updated_at = now(), is_default = false
  WHERE id = p_link_id;

  PERFORM public.cm_sync_room_default_invite_token(v_link.room_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_revoke_group_invite_link(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_revoke_group_invite_link(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_revoke_group_invite_link(uuid, uuid) TO service_role;

-- RLS: service_role only for mutations; authenticated no direct access
ALTER TABLE public.community_messenger_group_invite_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_group_invite_links_service ON public.community_messenger_group_invite_links;
CREATE POLICY cm_group_invite_links_service
  ON public.community_messenger_group_invite_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
