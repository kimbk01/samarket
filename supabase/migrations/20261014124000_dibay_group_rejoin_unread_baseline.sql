-- Room Unread Authority: Group leave/rejoin unread contract (A/B/C)
--
-- Phase 2 LOCK:
--   leave: left_at set; cursor/unread preserved
--   restore: left_at NULL + role member; cursor/unread/joined_at preserved
--
-- Product intervals:
--   A leave-before unread  → preserve
--   B leave-interval msgs  → exclude from canonical
--   C post-rejoin msgs     → include
--
-- leave → open interval (rejoined_at NULL)
-- rejoin → close interval (rejoined_at = now)
--
-- DO NOT: tip cursor force · unread_count=0 · joined_at=now wipe of A
-- DO NOT: heal / message_reads bulk / Badge·FCM·Bell

-- ---------------------------------------------------------------------------
-- Leave intervals (open while left; closed after rejoin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_messenger_membership_leave_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.community_messenger_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  left_at timestamptz NOT NULL,
  rejoined_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_messenger_membership_leave_intervals_order_chk
    CHECK (rejoined_at IS NULL OR rejoined_at >= left_at)
);

CREATE INDEX IF NOT EXISTS community_messenger_membership_leave_intervals_viewer_idx
  ON public.community_messenger_membership_leave_intervals (room_id, user_id, left_at, rejoined_at);

CREATE UNIQUE INDEX IF NOT EXISTS community_messenger_membership_leave_intervals_one_open_idx
  ON public.community_messenger_membership_leave_intervals (room_id, user_id)
  WHERE rejoined_at IS NULL;

COMMENT ON TABLE public.community_messenger_membership_leave_intervals IS
  'Room Unread: leave intervals excluded from canonical unread (B). Open=rejoined_at NULL; closed on rejoin.';

ALTER TABLE public.community_messenger_membership_leave_intervals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.community_messenger_membership_leave_intervals FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_messenger_membership_leave_intervals TO service_role;

-- Open interval whenever left_at transitions null → set (SQL leave + TS markParticipantLeft + probes)
CREATE OR REPLACE FUNCTION public.community_messenger_open_leave_interval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.left_at IS NULL AND NEW.left_at IS NOT NULL THEN
    INSERT INTO public.community_messenger_membership_leave_intervals (
      room_id, user_id, left_at, rejoined_at
    ) VALUES (
      NEW.room_id, NEW.user_id, NEW.left_at, NULL
    )
    ON CONFLICT (room_id, user_id) WHERE (rejoined_at IS NULL) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_messenger_open_leave_interval_trg
  ON public.community_messenger_participants;
CREATE TRIGGER community_messenger_open_leave_interval_trg
  AFTER UPDATE OF left_at ON public.community_messenger_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.community_messenger_open_leave_interval();

-- ---------------------------------------------------------------------------
-- Canonical: after cursor + joined_at bound, minus closed leave intervals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dibay_cm_canonical_unread_count(
  p_room_id uuid,
  p_viewer_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cursor_id uuid;
  v_cursor_at timestamptz;
  v_joined_at timestamptz;
  v_left_at timestamptz;
  v_count int;
BEGIN
  IF p_room_id IS NULL OR p_viewer_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT p.last_read_message_id, p.joined_at, p.left_at
    INTO v_cursor_id, v_joined_at, v_left_at
  FROM public.community_messenger_participants p
  WHERE p.room_id = p_room_id AND p.user_id = p_viewer_id;

  IF NOT FOUND OR v_left_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  IF v_cursor_id IS NOT NULL THEN
    SELECT m.created_at INTO v_cursor_at
    FROM public.community_messenger_messages m
    WHERE m.id = v_cursor_id AND m.room_id = p_room_id;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.community_messenger_messages m
  WHERE m.room_id = p_room_id
    AND m.deleted_at IS NULL
    AND m.sender_id IS DISTINCT FROM p_viewer_id
    AND (v_joined_at IS NULL OR m.created_at >= v_joined_at)
    AND (
      v_cursor_id IS NULL
      OR v_cursor_at IS NULL
      OR m.created_at > v_cursor_at
      OR (m.created_at = v_cursor_at AND m.id > v_cursor_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_messenger_membership_leave_intervals g
      WHERE g.room_id = p_room_id
        AND g.user_id = p_viewer_id
        AND g.rejoined_at IS NOT NULL
        AND m.created_at >= g.left_at
        AND m.created_at < g.rejoined_at
    );

  RETURN coalesce(v_count, 0);
END;
$$;

COMMENT ON FUNCTION public.dibay_cm_canonical_unread_count(uuid, uuid) IS
  'Room Unread Authority: peer msgs after cursor/joined_at, excluding closed leave intervals (A preserve, B exclude, C include).';

REVOKE ALL ON FUNCTION public.dibay_cm_canonical_unread_count(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dibay_cm_canonical_unread_count(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Activate / rejoin: close open leave interval; preserve cursor + unread + joined_at
-- ---------------------------------------------------------------------------
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
  v_now timestamptz := now();
  v_stored int;
  v_closed int := 0;
BEGIN
  SELECT id, left_at, role, unread_count, last_read_message_id
    INTO v_row
  FROM public.community_messenger_participants
  WHERE room_id = p_room_id AND user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_row.left_at IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'action', 'already_active');
    END IF;

    UPDATE public.community_messenger_membership_leave_intervals
    SET rejoined_at = v_now
    WHERE room_id = p_room_id
      AND user_id = p_user_id
      AND rejoined_at IS NULL;
    GET DIAGNOSTICS v_closed = ROW_COUNT;

    -- Legacy left rows (pre-trigger): close via insert if no open interval existed.
    IF v_closed = 0 THEN
      INSERT INTO public.community_messenger_membership_leave_intervals (
        room_id, user_id, left_at, rejoined_at
      ) VALUES (
        p_room_id, p_user_id, v_row.left_at, v_now
      );
    END IF;

    -- Phase 2 LOCK: clear left_at + demote only. Do NOT touch cursor / unread / joined_at.
    UPDATE public.community_messenger_participants
    SET
      left_at = NULL,
      role = 'member'
    WHERE room_id = p_room_id AND user_id = p_user_id;

    v_stored := coalesce(v_row.unread_count, 0);

    RETURN jsonb_build_object(
      'ok', true,
      'action', 'restored',
      'authority', 'room_unread_v1_leave_interval_exclude',
      'unread_count', v_stored,
      'last_read_message_id', v_row.last_read_message_id,
      'leave_interval_closed', true
    );
  END IF;

  INSERT INTO public.community_messenger_participants (room_id, user_id, role, left_at, joined_at)
  VALUES (p_room_id, p_user_id, 'member', NULL, v_now);

  RETURN jsonb_build_object('ok', true, 'action', 'inserted');
END;
$$;

COMMENT ON FUNCTION public.cm_group_activate_member(uuid, uuid) IS
  'Phase2/3 group activate+rejoin. On restore: close leave interval, left_at NULL, role member; preserve cursor/unread/joined_at (A/B/C).';

REVOKE ALL ON FUNCTION public.cm_group_activate_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cm_group_activate_member(uuid, uuid) TO service_role;
