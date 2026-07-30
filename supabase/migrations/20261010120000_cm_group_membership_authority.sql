-- Phase 2: group membership authority
-- 1) privileged column guard (authenticated cannot escalate role / kick others / rewrite identity)
-- 2) active owner uniqueness
-- 3) atomic private_group leave (owner transfer | archive)
-- App calls leave via service_role RPC (same as other CM group mutations).

-- ---------------------------------------------------------------------------
-- Guard: block privileged participant column changes for JWT authenticated role
-- service_role mutations (API) continue to work.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cm_participants_guard_privileged_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := coalesce(auth.role(), '');
BEGIN
  -- Service role API / SQL console: allow privileged mutations.
  IF jwt_role = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Non-authenticated sessions (e.g. other definer contexts): allow.
  IF jwt_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'cm_participants_identity_immutable';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'cm_participants_role_requires_server';
  END IF;

  -- Leave/kick/rejoin must go through server API (service_role), including self-leave.
  IF NEW.left_at IS DISTINCT FROM OLD.left_at THEN
    RAISE EXCEPTION 'cm_participants_leave_requires_server';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_participants_guard_privileged_update
  ON public.community_messenger_participants;

  CREATE TRIGGER trg_cm_participants_guard_privileged_update
  BEFORE UPDATE ON public.community_messenger_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.cm_participants_guard_privileged_update();

REVOKE ALL ON FUNCTION public.cm_participants_guard_privileged_update() FROM PUBLIC;

-- Insert guard: authenticated may only self-join as member (group invite/kick uses service_role).
CREATE OR REPLACE FUNCTION public.cm_participants_guard_privileged_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := coalesce(auth.role(), '');
BEGIN
  IF jwt_role = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF jwt_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'cm_participants_insert_requires_server';
  END IF;
  IF NEW.role IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'cm_participants_role_requires_server';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_participants_guard_privileged_insert
  ON public.community_messenger_participants;

CREATE TRIGGER trg_cm_participants_guard_privileged_insert
  BEFORE INSERT ON public.community_messenger_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.cm_participants_guard_privileged_insert();

REVOKE ALL ON FUNCTION public.cm_participants_guard_privileged_insert() FROM PUBLIC;

-- Active room participant helpers must ignore left members (RLS admin check).
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
      AND p.left_at IS NULL
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
      AND p.left_at IS NULL
      AND p.role IN ('owner', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Active owner uniqueness (preflight fails if duplicates exist)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.community_messenger_participants
    WHERE role = 'owner'
      AND left_at IS NULL
    GROUP BY room_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'cm_group_active_owner_duplicate: resolve duplicate active owners before unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS community_messenger_participants_one_active_owner_uidx
  ON public.community_messenger_participants (room_id)
  WHERE role = 'owner' AND left_at IS NULL;

-- ---------------------------------------------------------------------------
-- Atomic private_group leave (service_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_messenger_leave_private_group(
  p_room_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room record;
  v_me record;
  v_successor uuid;
  v_now timestamptz := now();
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  SELECT id, room_type, room_status, owner_user_id
  INTO v_room
  FROM public.community_messenger_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.room_type IS DISTINCT FROM 'private_group' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  SELECT id, user_id, role, left_at
  INTO v_me
  FROM public.community_messenger_participants
  WHERE room_id = p_room_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_me.left_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  IF coalesce(v_room.owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_user_id
     OR v_me.role = 'owner' THEN
    SELECT p.user_id
    INTO v_successor
    FROM public.community_messenger_participants p
    WHERE p.room_id = p_room_id
      AND p.user_id IS DISTINCT FROM p_user_id
      AND p.left_at IS NULL
      AND p.blocked_hidden_at IS NULL
    ORDER BY p.joined_at ASC NULLS LAST, p.user_id ASC
    LIMIT 1
    FOR UPDATE;

    IF v_successor IS NOT NULL THEN
      -- Leave+demote current owner first so unique active-owner index stays valid.
      UPDATE public.community_messenger_participants
      SET left_at = v_now,
          role = 'member'
      WHERE room_id = p_room_id
        AND user_id = p_user_id
        AND left_at IS NULL;

      UPDATE public.community_messenger_participants
      SET role = 'owner'
      WHERE room_id = p_room_id
        AND user_id = v_successor
        AND left_at IS NULL;

      UPDATE public.community_messenger_rooms
      SET owner_user_id = v_successor
      WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'ok', true,
        'action', 'transferred',
        'next_owner_user_id', v_successor
      );
    END IF;

    UPDATE public.community_messenger_rooms
    SET room_status = 'archived'
    WHERE id = p_room_id;

    UPDATE public.community_messenger_participants
    SET left_at = v_now,
        role = 'member'
    WHERE room_id = p_room_id
      AND user_id = p_user_id
      AND left_at IS NULL;

    RETURN jsonb_build_object('ok', true, 'action', 'archived');
  END IF;

  UPDATE public.community_messenger_participants
  SET left_at = v_now
  WHERE room_id = p_room_id
    AND user_id = p_user_id
    AND left_at IS NULL;

  RETURN jsonb_build_object('ok', true, 'action', 'left');
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_leave_private_group(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_leave_private_group(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_leave_private_group(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.community_messenger_leave_private_group(uuid, uuid) IS
  'Phase2 atomic private_group leave: transfer to oldest active member or archive; service_role only.';
