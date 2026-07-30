-- Phase 3 S2-4: Soft Delete Tombstone for private_group (Hard DELETE forbidden)
-- Canonical: rooms.deleted_at / deleted_by — orthogonal to room_status archive & viewer is_archived

ALTER TABLE public.community_messenger_rooms
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

ALTER TABLE public.community_messenger_rooms
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.community_messenger_rooms.deleted_at IS
  'Phase3 S2-4: Group Delete tombstone. Soft only — never hard-delete room row for user delete.';
COMMENT ON COLUMN public.community_messenger_rooms.deleted_by IS
  'Phase3 S2-4: Owner who soft-deleted the group.';

CREATE INDEX IF NOT EXISTS community_messenger_rooms_active_non_deleted_idx
  ON public.community_messenger_rooms (id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS community_messenger_rooms_deleted_at_idx
  ON public.community_messenger_rooms (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cm_group_room_is_deleted(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_messenger_rooms r
    WHERE r.id = p_room_id
      AND r.deleted_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.cm_group_room_is_deleted(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cm_group_room_is_deleted(uuid) TO service_role;

-- Owner-only soft delete. Does NOT leave, kick, ban, archive, or hard-delete.
CREATE OR REPLACE FUNCTION public.community_messenger_delete_private_group(
  p_room_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room record;
  v_actor record;
  v_now timestamptz := now();
BEGIN
  IF p_room_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT id, room_type, room_status, owner_user_id, deleted_at, deleted_by
  INTO v_room
  FROM public.community_messenger_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.room_type IS DISTINCT FROM 'private_group' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  -- Idempotent: already tombstoned
  IF v_room.deleted_at IS NOT NULL THEN
    IF coalesce(v_room.deleted_by, '00000000-0000-0000-0000-000000000000'::uuid) = p_actor_user_id
       OR coalesce(v_room.owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_actor_user_id THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_deleted', true,
        'room_id', p_room_id,
        'deleted_at', v_room.deleted_at,
        'deleted_by', v_room.deleted_by
      );
    END IF;
    -- Non-owner / non-deleter: do not leak internal state
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  SELECT user_id, role, left_at
  INTO v_actor
  FROM public.community_messenger_participants
  WHERE room_id = p_room_id AND user_id = p_actor_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_actor.left_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Owner only (participant role=owner OR rooms.owner_user_id). Admin/member cannot delete.
  IF v_actor.role IS DISTINCT FROM 'owner'
     AND coalesce(v_room.owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
         IS DISTINCT FROM p_actor_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- CAS tombstone
  UPDATE public.community_messenger_rooms
  SET deleted_at = v_now,
      deleted_by = p_actor_user_id
  WHERE id = p_room_id
    AND deleted_at IS NULL
  RETURNING deleted_at, deleted_by INTO v_room.deleted_at, v_room.deleted_by;

  IF NOT FOUND THEN
    SELECT deleted_at, deleted_by INTO v_room.deleted_at, v_room.deleted_by
    FROM public.community_messenger_rooms WHERE id = p_room_id;
    RETURN jsonb_build_object(
      'ok', true,
      'already_deleted', true,
      'room_id', p_room_id,
      'deleted_at', v_room.deleted_at,
      'deleted_by', v_room.deleted_by
    );
  END IF;

  -- Close active invite authority (history rows kept)
  UPDATE public.community_messenger_group_invite_links
  SET revoked_at = coalesce(revoked_at, v_now),
      updated_at = v_now
  WHERE room_id = p_room_id
    AND revoked_at IS NULL;

  -- Close pending join requests (history kept)
  UPDATE public.community_messenger_group_join_requests
  SET status = 'rejected',
      decided_at = coalesce(decided_at, v_now),
      decided_by = coalesce(decided_by, p_actor_user_id),
      updated_at = v_now
  WHERE room_id = p_room_id
    AND status = 'pending';

  -- DO NOT: DELETE rooms / participants / messages / bans / audits
  -- DO NOT: mass left_at
  -- DO NOT: change room_status (archive ≠ delete)

  RETURN jsonb_build_object(
    'ok', true,
    'already_deleted', false,
    'room_id', p_room_id,
    'deleted_at', v_now,
    'deleted_by', p_actor_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.community_messenger_delete_private_group(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_delete_private_group(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_delete_private_group(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.community_messenger_delete_private_group(uuid, uuid) IS
  'Phase3 S2-4: Owner soft-deletes private_group via deleted_at tombstone. Hard DELETE forbidden.';

-- Defense-in-depth: block new invite links / join requests / messages / rejoin on deleted rooms
CREATE OR REPLACE FUNCTION public.cm_block_write_on_deleted_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  v_room_id := COALESCE(NEW.room_id, OLD.room_id);
  IF v_room_id IS NOT NULL AND public.cm_group_room_is_deleted(v_room_id) THEN
    RAISE EXCEPTION 'room_deleted'
      USING ERRCODE = 'check_violation',
            HINT = 'group soft-deleted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cm_invite_links_block_deleted ON public.community_messenger_group_invite_links;
CREATE TRIGGER cm_invite_links_block_deleted
  BEFORE INSERT ON public.community_messenger_group_invite_links
  FOR EACH ROW
  EXECUTE FUNCTION public.cm_block_write_on_deleted_group();

DROP TRIGGER IF EXISTS cm_join_requests_block_deleted ON public.community_messenger_group_join_requests;
CREATE TRIGGER cm_join_requests_block_deleted
  BEFORE INSERT ON public.community_messenger_group_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.cm_block_write_on_deleted_group();

DROP TRIGGER IF EXISTS cm_messages_block_deleted ON public.community_messenger_messages;
CREATE TRIGGER cm_messages_block_deleted
  BEFORE INSERT ON public.community_messenger_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.cm_block_write_on_deleted_group();

-- Rejoin = left_at cleared; block on deleted group
CREATE OR REPLACE FUNCTION public.cm_block_rejoin_on_deleted_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.left_at IS NOT NULL
     AND NEW.left_at IS NULL
     AND public.cm_group_room_is_deleted(NEW.room_id) THEN
    RAISE EXCEPTION 'room_deleted'
      USING ERRCODE = 'check_violation',
            HINT = 'group soft-deleted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cm_participants_block_rejoin_deleted ON public.community_messenger_participants;
CREATE TRIGGER cm_participants_block_rejoin_deleted
  BEFORE UPDATE OF left_at ON public.community_messenger_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.cm_block_rejoin_on_deleted_group();

-- Exclude soft-deleted groups from CM unread / hub badge room count
CREATE OR REPLACE FUNCTION public.get_community_messenger_unread_room_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(count(*)::int, 0)
  FROM public.community_messenger_participants p
  INNER JOIN public.community_messenger_rooms r ON r.id = p.room_id
  WHERE p.user_id = p_user_id
    AND p.unread_count > 0
    AND r.deleted_at IS NULL
    AND (
      r.chat_domain IN ('general_direct', 'group')
      OR (
        r.chat_domain IS NULL
        AND coalesce(r.direct_key, '') NOT LIKE 'trade_pc:%'
        AND coalesce(r.direct_key, '') NOT LIKE 'trade_item:%'
        AND coalesce(r.direct_key, '') NOT LIKE 'store_order:%'
        AND coalesce(r.direct_key, '') NOT LIKE 'trade_order:%'
      )
    );
$$;

COMMENT ON FUNCTION public.get_community_messenger_unread_room_count(uuid) IS
  'B3 Bottom Chat / hub CM badge: unread room count for general_direct+group only; excludes soft-deleted groups (Phase3 S2-4).';
