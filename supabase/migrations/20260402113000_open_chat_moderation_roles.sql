ALTER TABLE public.open_chat_members
  ADD COLUMN IF NOT EXISTS is_message_blinded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS message_blinded_at timestamptz,
  ADD COLUMN IF NOT EXISTS message_blinded_by uuid,
  ADD COLUMN IF NOT EXISTS message_blind_reason text;

CREATE INDEX IF NOT EXISTS open_chat_members_room_blinded_idx
  ON public.open_chat_members (room_id, updated_at DESC)
  WHERE is_message_blinded = true;

CREATE OR REPLACE FUNCTION public.guard_open_chat_member_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL
     OR public.is_platform_admin(v_actor)
     OR public.can_manage_open_chat_room(OLD.room_id, v_actor)
  THEN
    RETURN NEW;
  END IF;

  IF v_actor <> OLD.user_id THEN
    RAISE EXCEPTION 'open_chat_member_update_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.room_id IS DISTINCT FROM OLD.room_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
     OR NEW.kicked_at IS DISTINCT FROM OLD.kicked_at
     OR NEW.kicked_by IS DISTINCT FROM OLD.kicked_by
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
     OR NEW.status_reason IS DISTINCT FROM OLD.status_reason
     OR NEW.is_message_blinded IS DISTINCT FROM OLD.is_message_blinded
     OR NEW.message_blinded_at IS DISTINCT FROM OLD.message_blinded_at
     OR NEW.message_blinded_by IS DISTINCT FROM OLD.message_blinded_by
     OR NEW.message_blind_reason IS DISTINCT FROM OLD.message_blind_reason
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'open_chat_member_update_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'joined' AND NEW.status = 'left') THEN
      RAISE EXCEPTION 'open_chat_member_status_forbidden' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.last_status_changed_at IS DISTINCT FROM OLD.last_status_changed_at THEN
    RAISE EXCEPTION 'open_chat_member_update_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'left' AND NEW.left_at IS NULL THEN
    NEW.left_at := now();
  ELSIF NEW.left_at IS DISTINCT FROM OLD.left_at THEN
    RAISE EXCEPTION 'open_chat_member_update_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;
